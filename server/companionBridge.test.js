import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AQMD_FEED_CONTRACT, COMMUTE_INGEST_CONTRACT } from '../shared/companions.js';
import { creditBalance, reviewEvidence, submitChargingEvidence, submitCommuteEvidence } from './pilotService.js';
import { ingestAqmdFeedDocument } from './companionBridge.js';
import { memoryPilot, offPeakStart, readyPilot } from './testHelpers.js';
import { createApp } from './app.js';

function sampleFeed(overrides = {}) {
  return {
    contract_version: AQMD_FEED_CONTRACT,
    generated_at: '2026-09-14T12:00:00.000Z',
    institution: { id: '12', name: 'Pasadena research org', slug: 'pasadena-research' },
    guardrails: {
      source_of_truth: 'relay_rider_beta',
      downstream_consumer: 'aqmd_module',
      writes_to_beta: false,
      rule2202_is_certification: false,
      records_are_validated_only: true,
      ...overrides.guardrails,
    },
    records: [{
      record_id: 'rr-rec-1',
      external_id: 'rr-participant-a',
      institution_id: '12',
      origin_zone: 'Eagle Rock',
      destination_zone: 'Pasadena',
      commute_mode: 'drive_alone',
      vehicle_fuel_type: 'ev',
      commute_date: '2026-09-03',
      source_sha256: 'abc123',
      consent_confirmed: true,
      validation_status: 'valid',
      ...overrides.record,
    }],
  };
}

async function listen(db) {
  const app = createApp(db, { uploadDir: mkdtempSync(join(tmpdir(), 'ev-')) });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('Relay Rider AQMD feed becomes pending Green Wallet commute evidence', () => {
  const { db, admin, participant } = memoryPilot();
  const result = ingestAqmdFeedDocument(db, admin, sampleFeed());
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].participantId, participant.id);
  const commute = db.prepare('SELECT * FROM commute_evidence WHERE id = ?').get(result.created[0].commuteEvidenceId);
  assert.equal(commute.decision, 'pending');
  assert.equal(commute.origin_zone, 'Eagle Rock');
  assert.equal(creditBalance(db, participant.id), 0);
});

test('AQMD / Rule 2202 packages do not mint credits', () => {
  const { db, admin, participant } = readyPilot();
  ingestAqmdFeedDocument(db, admin, sampleFeed());
  assert.equal(creditBalance(db, participant.id), 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM awards').get().n, 0);
});

test('companion commute ingest is idempotent on source record id', () => {
  const { db, admin } = memoryPilot();
  const first = ingestAqmdFeedDocument(db, admin, sampleFeed());
  const second = ingestAqmdFeedDocument(db, admin, sampleFeed());
  assert.equal(first.created.length, 1);
  assert.equal(second.created.length, 0);
  assert.equal(second.skipped[0].reason, 'DUPLICATE_SOURCE_RECORD');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM commute_evidence').get().n, 1);
});

test('unmapped Relay Rider participants are skipped', () => {
  const { db, admin } = memoryPilot();
  const result = ingestAqmdFeedDocument(db, admin, sampleFeed({ record: { external_id: 'unknown-person' } }));
  assert.equal(result.created.length, 0);
  assert.equal(result.skipped[0].reason, 'UNMAPPED_PARTICIPANT');
});

test('unsafe writable feed documents are rejected', () => {
  const { db, admin } = memoryPilot();
  assert.throws(
    () => ingestAqmdFeedDocument(db, admin, sampleFeed({ guardrails: { writes_to_beta: true } })),
    (error) => error.code === 'UNSAFE_FEED',
  );
});

test('award writes an outbound companion event for Relay Rider', () => {
  const { db, admin, participant, hubId } = readyPilot();
  const commute = submitCommuteEvidence(db, participant, {
    commuteDate: '2026-09-05',
    originZone: 'Pasadena',
    destination: 'Worksite',
    travelMode: 'battery_electric_vehicle',
    attestation: true,
  });
  reviewEvidence(db, admin, { type: 'commute', id: commute.id, decision: 'accepted' });
  const charging = submitChargingEvidence(db, participant, {
    hubId,
    chargingDate: '2026-09-05',
    startAt: offPeakStart('2026-09-05'),
    energyKwh: '5.0',
    evidenceSource: 'receipt',
    sessionIdentifier: 'companion-award',
  });
  reviewEvidence(db, admin, { type: 'charging', id: charging.id, decision: 'accepted' });
  const event = db.prepare("SELECT * FROM companion_sync_events WHERE event_type = 'award_created'").get();
  assert.ok(event);
  assert.equal(event.companion, 'relay_rider_beta');
  assert.equal(event.direction, 'outbound');
});

test('machine token can push a commute day without CSRF cookie', async () => {
  process.env.COMPANION_INGEST_TOKEN = 'test-companion-token';
  const { db } = memoryPilot();
  const { server, base } = await listen(db);
  try {
    const response = await fetch(`${base}/api/integrations/commute-days`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-companion-token': 'test-companion-token',
      },
      body: JSON.stringify({
        contract_version: COMMUTE_INGEST_CONTRACT,
        external_id: 'rr-participant-a',
        commute_date: '2026-09-04',
        origin_zone: 'Northwest Pasadena',
        destination_zone: 'Pasadena',
        travel_mode: 'battery_electric_vehicle',
        vehicle_fuel_type: 'bev',
        record_id: 'push-1',
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.created.length, 1);
  } finally {
    server.close();
    delete process.env.COMPANION_INGEST_TOKEN;
  }
});
