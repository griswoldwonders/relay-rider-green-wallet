import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyMigrations, openDatabase } from './db.js';
import { seedDatabase, DEMO_PASSWORD } from './seed.js';
import { createApp } from './app.js';
import { readyPilot } from './testHelpers.js';
import { CHECKLIST_ITEMS } from '../shared/contract.js';
import { activateHub, activatePilot, completeChecklistItem } from './pilotService.js';

async function listen(db, uploadDir) {
  const app = createApp(db, { uploadDir });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

async function login(base, email) {
  const response = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  const body = await response.json();
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  return { cookie, csrf: body.csrfToken, body, status: response.status };
}

function api(base, cookie, csrf) {
  return (path, { method = 'GET', body, headers = {} } = {}) => fetch(`${base}${path}`, {
    method,
    headers: {
      cookie,
      'x-csrf-token': csrf,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('participant cannot assign administrative redemption statuses', async () => {
  const { db } = readyPilot();
  const { server, base } = await listen(db, mkdtempSync(join(tmpdir(), 'ev-')));
  try {
    const session = await login(base, 'rider.a@example.test');
    const call = api(base, session.cookie, session.csrf);
    const response = await call('/api/participant/redemptions', { method: 'POST', body: { credits: 500, deliveryMethod: 'voucher', status: 'approved' } });
    assert.equal(response.status, 403);
    const json = await response.json();
    assert.equal(json.error, 'CLIENT_STATUS_FORBIDDEN');
    const adminAssign = await call('/api/admin/redemptions/x/transition', { method: 'POST', body: { action: 'approve' } });
    assert.equal(adminAssign.status, 403);
  } finally {
    server.close();
  }
});

test('cross-participant and cross-tenant evidence access is denied', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ev-'));
  const db = openDatabase(':memory:');
  applyMigrations(db);
  seedDatabase(db);
  const admin = db.prepare("SELECT * FROM users WHERE id = 'user-admin-01'").get();
  activatePilot(db, admin, { effectiveAt: '2026-09-01T07:00:00.000Z' });
  const { server, base } = await listen(db, dir);
  try {
    const riderA = await login(base, 'rider.a@example.test');
    const callA = api(base, riderA.cookie, riderA.csrf);
    const upload = await callA('/api/participant/evidence-files', {
      method: 'POST',
      body: { filename: 'receipt.txt', mimeType: 'text/plain', contentBase64: Buffer.from('secret-a').toString('base64') },
    });
    assert.equal(upload.status, 201);
    const file = await upload.json();

    const riderB = await login(base, 'rider.b@example.test');
    const callB = api(base, riderB.cookie, riderB.csrf);
    const peek = await callB(`/api/participant/evidence-files/${file.id}`);
    assert.equal(peek.status, 403);

    const outsider = await login(base, 'outsider@other-tenant.example');
    const callO = api(base, outsider.cookie, outsider.csrf);
    const peekOut = await callO(`/api/participant/evidence-files/${file.id}`);
    assert.equal(peekOut.status, 403);

    const dashB = await (await callB('/api/participant/dashboard')).json();
    assert.equal(dashB.availableCredits, 0);
    assert.ok(!JSON.stringify(dashB).includes('secret-a'));
  } finally {
    server.close();
  }
});

test('repeated redemption API requests with the same idempotency key do not double-reserve', async () => {
  const { db, admin, participant } = readyPilot();
  const { acceptPair, hubId } = { hubId: 'hub-marengo-charging-plaza' };
  void participant;
  const { server, base } = await listen(db, mkdtempSync(join(tmpdir(), 'ev-')));
  try {
    for (const item of CHECKLIST_ITEMS) {
      try { completeChecklistItem(db, admin, hubId, item.key); } catch { /* already complete */ }
    }
    try { activateHub(db, admin, hubId); } catch { /* already active */ }
    const { submitCommuteEvidence, reviewEvidence, submitChargingEvidence } = await import('./pilotService.js');
    const rider = db.prepare("SELECT * FROM users WHERE id = 'user-participant-a'").get();
    for (let day = 1; day <= 5; day += 1) {
    const date = `2026-09-${String(day).padStart(2, '0')}`;
      const commute = submitCommuteEvidence(db, rider, {
        commuteDate: date, originZone: 'Pasadena', destination: 'Site', travelMode: 'battery_electric_vehicle', attestation: true,
      });
      reviewEvidence(db, admin, { type: 'commute', id: commute.id, decision: 'accepted' });
      const charging = submitChargingEvidence(db, rider, {
        hubId, chargingDate: date, startAt: `${date}T16:00:00.000Z`, energyKwh: '5.0', evidenceSource: 'receipt', sessionIdentifier: `idemp-${date}`,
      });
      reviewEvidence(db, admin, { type: 'charging', id: charging.id, decision: 'accepted' });
    }
    const session = await login(base, 'rider.a@example.test');
    const call = api(base, session.cookie, session.csrf);
    const first = await call('/api/participant/redemptions', {
      method: 'POST',
      body: { credits: 500, deliveryMethod: 'voucher' },
      headers: { 'idempotency-key': 'same-key' },
    });
    const second = await call('/api/participant/redemptions', {
      method: 'POST',
      body: { credits: 500, deliveryMethod: 'voucher' },
      headers: { 'idempotency-key': 'same-key' },
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const a = await first.json();
    const b = await second.json();
    assert.equal(a.id, b.id);
    const count = db.prepare('SELECT COUNT(*) AS n FROM redemptions').get().n;
    assert.equal(count, 1);
  } finally {
    server.close();
    void acceptPair;
  }
});
