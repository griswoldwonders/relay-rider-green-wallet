import {
  AQMD_FEED_CONTRACT,
  AWARD_EVENT_CONTRACT,
  COMMUTE_INGEST_CONTRACT,
  COMPANIONS,
  commuteDateFromFeedRecord,
  isElectricFuelType,
} from '../shared/companions.js';
import { PilotError, newCorrelationId, newId, nowIso } from './util.js';
import { USER_ROLES } from '../shared/contract.js';

function requireAdmin(actor) {
  if (actor?.role !== USER_ROLES.administrator) {
    throw new PilotError('FORBIDDEN', 'administrator role required', 403);
  }
}

export function companionStatus(db) {
  const lastInbound = db.prepare(`SELECT * FROM companion_sync_events WHERE direction = 'inbound' ORDER BY id DESC LIMIT 1`).get();
  const lastOutbound = db.prepare(`SELECT * FROM companion_sync_events WHERE direction = 'outbound' ORDER BY id DESC LIMIT 1`).get();
  const mapped = db.prepare('SELECT COUNT(*) AS n FROM companion_identities').get().n;
  const linkedCommutes = db.prepare('SELECT COUNT(*) AS n FROM commute_companion_links').get().n;
  return {
    ownership: COMPANIONS,
    configured: {
      relayRiderApiBase: Boolean(process.env.RELAY_RIDER_API_BASE),
      relayRiderInstitutionId: process.env.RELAY_RIDER_INSTITUTION_ID || null,
      awardWebhook: Boolean(process.env.RELAY_RIDER_AWARD_WEBHOOK_URL),
      ingestTokenConfigured: Boolean(process.env.COMPANION_INGEST_TOKEN),
    },
    mappedIdentities: Number(mapped),
    linkedCommuteEvidence: Number(linkedCommutes),
    lastInbound,
    lastOutbound,
    reminder: 'Rule 2202 packages from the AQMD module never mint Green Route Credits. Charging kWh stays in Green Wallet.',
  };
}

export function upsertCompanionIdentity(db, actor, input) {
  requireAdmin(actor);
  const id = newId('cid');
  db.prepare(`INSERT INTO companion_identities (
    id, tenant_id, user_id, relay_rider_profile_id, relay_rider_external_id, aqmd_participant_key, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    actor.tenant_id,
    input.userId,
    input.relayRiderProfileId ?? null,
    input.relayRiderExternalId ?? null,
    input.aqmdParticipantKey ?? input.relayRiderExternalId ?? null,
    nowIso(),
  );
  return db.prepare('SELECT * FROM companion_identities WHERE id = ?').get(id);
}

function resolveParticipant(db, tenantId, externalId) {
  if (!externalId) return null;
  return db.prepare(`SELECT users.* FROM companion_identities
    JOIN users ON users.id = companion_identities.user_id
    WHERE companion_identities.tenant_id = ?
      AND (companion_identities.relay_rider_external_id = ? OR companion_identities.aqmd_participant_key = ?)`).get(tenantId, externalId, externalId);
}

function recordSync(db, row) {
  db.prepare(`INSERT INTO companion_sync_events (
    tenant_id, direction, companion, event_type, status, payload_json, correlation_id, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.tenantId,
    row.direction,
    row.companion,
    row.eventType,
    row.status,
    JSON.stringify(row.payload ?? {}),
    row.correlationId,
    nowIso(),
  );
}

export function ingestCommuteRecords(db, actor, records, meta = {}) {
  requireAdmin(actor);
  const sourceSystem = meta.sourceSystem || COMPANIONS.relayRiderBeta.id;
  const feedContract = meta.feedContract || AQMD_FEED_CONTRACT;
  const correlationId = newCorrelationId();
  const created = [];
  const skipped = [];
  for (const record of records) {
    const externalId = record.external_id || record.participant_external_id || record.participant_key;
    const participant = resolveParticipant(db, actor.tenant_id, externalId);
    if (!participant) {
      skipped.push({ externalId, reason: 'UNMAPPED_PARTICIPANT' });
      continue;
    }
    const dated = commuteDateFromFeedRecord(record);
    if (!dated) {
      skipped.push({ externalId, reason: 'MISSING_COMMUTE_DATE' });
      continue;
    }
    const sourceRecordId = String(record.record_id || record.relay_rider_record_id || `${externalId}:${dated.date}`);
    const existing = db.prepare('SELECT commute_evidence_id FROM commute_companion_links WHERE source_system = ? AND source_record_id = ?')
      .get(sourceSystem, sourceRecordId);
    if (existing) {
      skipped.push({ externalId, reason: 'DUPLICATE_SOURCE_RECORD', commuteEvidenceId: existing.commute_evidence_id });
      continue;
    }
    const commuteId = newId('cme');
    db.prepare(`INSERT INTO commute_evidence (
      id, tenant_id, participant_id, commute_date, origin_zone, destination, travel_mode, vehicle_id, attestation, submitted_at, decision
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending')`).run(
      commuteId,
      actor.tenant_id,
      participant.id,
      dated.date,
      record.origin_zone || 'unspecified',
      record.destination_zone || record.destination || 'Pasadena participating site',
      record.commute_mode || record.travel_mode || 'battery_electric_vehicle',
      participant.vehicle_id,
      nowIso(),
    );
    db.prepare(`INSERT INTO commute_companion_links (
      commute_evidence_id, source_system, source_record_id, source_sha256, participant_external_id,
      institution_id, feed_contract, vehicle_fuel_type, date_provenance, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      commuteId,
      sourceSystem,
      sourceRecordId,
      record.source_sha256 || null,
      externalId,
      String(record.institution_id || meta.institutionId || ''),
      feedContract,
      record.vehicle_fuel_type || null,
      dated.provenance,
      nowIso(),
    );
    created.push({
      commuteEvidenceId: commuteId,
      participantId: participant.id,
      commuteDate: dated.date,
      electricFuel: isElectricFuelType(record.vehicle_fuel_type),
      dateProvenance: dated.provenance,
    });
  }
  recordSync(db, {
    tenantId: actor.tenant_id,
    direction: 'inbound',
    companion: sourceSystem,
    eventType: 'commute_ingest',
    status: 'accepted',
    payload: { created: created.length, skipped: skipped.length, feedContract },
    correlationId,
  });
  return { created, skipped, correlationId };
}

export function ingestAqmdFeedDocument(db, actor, feed) {
  if (feed?.contract_version !== AQMD_FEED_CONTRACT) {
    throw new PilotError('UNSUPPORTED_FEED', `expected ${AQMD_FEED_CONTRACT}`, 400);
  }
  if (feed?.guardrails?.writes_to_beta !== false) {
    throw new PilotError('UNSAFE_FEED', 'Relay Rider AQMD feed must be read-only toward beta', 400);
  }
  return ingestCommuteRecords(db, actor, feed.records || [], {
    sourceSystem: COMPANIONS.relayRiderBeta.id,
    feedContract: AQMD_FEED_CONTRACT,
    institutionId: feed.institution?.id,
  });
}

export async function pullRelayRiderAqmdFeed(db, actor, fetchImpl = fetch) {
  requireAdmin(actor);
  const base = process.env.RELAY_RIDER_API_BASE;
  const token = process.env.RELAY_RIDER_API_TOKEN;
  const institutionId = process.env.RELAY_RIDER_INSTITUTION_ID;
  if (!base || !token || !institutionId) {
    throw new PilotError('COMPANION_NOT_CONFIGURED', 'RELAY_RIDER_API_BASE, RELAY_RIDER_API_TOKEN, and RELAY_RIDER_INSTITUTION_ID are required to pull the feed', 503);
  }
  const url = `${base.replace(/\/$/, '')}/institutions/${encodeURIComponent(institutionId)}/aqmd-feed/`;
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', Authorization: `Token ${token}` },
  });
  const feed = await response.json();
  if (!response.ok) {
    throw new PilotError('FEED_FETCH_FAILED', feed.detail || `Relay Rider feed failed (${response.status})`, 502);
  }
  return ingestAqmdFeedDocument(db, actor, feed);
}

export function ingestPushedCommuteDay(db, actor, body) {
  if (body?.contract_version && body.contract_version !== COMMUTE_INGEST_CONTRACT) {
    throw new PilotError('UNSUPPORTED_FEED', `expected ${COMMUTE_INGEST_CONTRACT}`, 400);
  }
  return ingestCommuteRecords(db, actor, [body], {
    sourceSystem: body.source_system === 'aqmd_external_import' ? COMPANIONS.aqmdModule.id : COMPANIONS.relayRiderBeta.id,
    feedContract: body.feed_contract || body.contract_version || COMMUTE_INGEST_CONTRACT,
    institutionId: body.institution_id,
  });
}

export function recordOutboundAward(db, award) {
  const payload = {
    contract_version: AWARD_EVENT_CONTRACT,
    award_id: award.id,
    participant_id: award.participant_id,
    local_date: award.local_date,
    credits: award.credits,
    commute_evidence_id: award.commute_evidence_id,
    charging_evidence_id: award.charging_evidence_id,
  };
  recordSync(db, {
    tenantId: award.tenant_id,
    direction: 'outbound',
    companion: COMPANIONS.relayRiderBeta.id,
    eventType: 'award_created',
    status: 'recorded',
    payload,
    correlationId: award.correlation_id,
  });
  const webhook = process.env.RELAY_RIDER_AWARD_WEBHOOK_URL;
  if (webhook) {
    fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((error) => {
      console.error('award webhook failed', error.message);
    });
  }
  return payload;
}

export function companionTokenValid(headerValue) {
  const expected = process.env.COMPANION_INGEST_TOKEN;
  if (!expected) return false;
  return headerValue === expected || headerValue === `Bearer ${expected}`;
}
