import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AWARD_CREDITS,
  CHECKLIST_ITEMS,
  FUNDED_CENTS,
  isPeakStart,
  kWhToWh,
  localCalendarDate,
} from '../shared/contract.js';
import { applyMigrations, openDatabase, rollbackLastMigration } from './db.js';
import { seedDatabase } from './seed.js';
import {
  activateHub,
  activatePilot,
  budgetSnapshot,
  completeChecklistItem,
  creditBalance,
  evaluateAward,
  monthlyReport,
  requestRedemption,
  reviewEvidence,
  submitChargingEvidence,
  submitCommuteEvidence,
  transitionRedemption,
} from './pilotService.js';
import { PilotError } from './util.js';
import { memoryPilot, offPeakStart, readyPilot } from './testHelpers.js';

function acceptPair(db, admin, participant, { date, energyKwh = '5.0', startAt, hubId, sessionIdentifier }) {
  const commute = submitCommuteEvidence(db, participant, {
    commuteDate: date,
    originZone: 'Northwest Pasadena',
    destination: 'Participating Pasadena worksite',
    travelMode: 'battery_electric_vehicle',
    attestation: true,
  });
  reviewEvidence(db, admin, { type: 'commute', id: commute.id, decision: 'accepted', notes: 'verified commute' });
  const charging = submitChargingEvidence(db, participant, {
    hubId,
    chargingDate: date,
    startAt: startAt || offPeakStart(date),
    endAt: `${date}T18:00:00.000Z`,
    energyKwh,
    evidenceSource: 'receipt',
    sessionIdentifier: sessionIdentifier || `sess-${date}-${participant.id}`,
    amountChargedCents: 400,
  });
  return reviewEvidence(db, admin, { type: 'charging', id: charging.id, decision: 'accepted', notes: 'verified session' });
}

test('migrations apply and rollback cleanly', () => {
  const db = openDatabase(':memory:');
  applyMigrations(db);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'credit_ledger'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'companion_identities'").get());
  assert.equal(rollbackLastMigration(db), '002_companion_bridge.sql');
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'companion_identities'").get(), undefined);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'credit_ledger'").get());
  assert.equal(rollbackLastMigration(db), '001_pasadena_pilot.sql');
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'credit_ledger'").get(), undefined);
  applyMigrations(db);
  seedDatabase(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM charging_hubs').get().n, 2);
  assert.equal(db.prepare('SELECT enabled FROM pilot_config WHERE id = 1').get().enabled, 0);
  db.close();
});

test('seeded Pasadena hubs are verified but not active', () => {
  const { db } = memoryPilot();
  const hubs = db.prepare('SELECT * FROM charging_hubs ORDER BY name').all();
  assert.deepEqual(hubs.map((hub) => hub.activation_status), ['pending', 'pending']);
  assert.ok(hubs.every((hub) => hub.verification_status === 'location_verified'));
});

test('exactly 100 credits awarded for a qualifying day', () => {
  const { db, admin, participant, hubId } = readyPilot();
  const result = acceptPair(db, admin, participant, { date: '2026-09-02', hubId });
  assert.equal(result.award.credits, AWARD_CREDITS);
  assert.equal(creditBalance(db, participant.id), 100);
});

test('no award below 5.0 kWh', () => {
  const { db, admin, participant, hubId } = readyPilot();
  const result = acceptPair(db, admin, participant, { date: '2026-09-02', hubId, energyKwh: '4.999' });
  assert.equal(result.award.awarded, false);
  assert.ok(result.award.reasons.includes('ENERGY_BELOW_MINIMUM'));
  assert.equal(creditBalance(db, participant.id), 0);
});

test('no award during 4:00-9:00 p.m. America/Los_Angeles', () => {
  const { db, admin, participant, hubId } = readyPilot();
  const startAt = '2026-09-02T23:30:00.000Z'; // 4:30 p.m. PDT
  assert.equal(isPeakStart(startAt), true);
  const result = acceptPair(db, admin, participant, { date: '2026-09-02', hubId, startAt });
  assert.equal(result.award.awarded, false);
  assert.ok(result.award.reasons.includes('PEAK_WINDOW'));
});

test('one award per participant per local calendar day', () => {
  const { db, admin, participant, hubId } = readyPilot();
  acceptPair(db, admin, participant, { date: '2026-09-02', hubId, sessionIdentifier: 'a' });
  const second = acceptPair(db, admin, participant, { date: '2026-09-02', hubId, sessionIdentifier: 'b', startAt: '2026-09-02T17:00:00.000Z' });
  assert.equal(second.award.awarded, false);
  assert.ok(second.award.reasons.includes('DAILY_LIMIT'));
  assert.equal(creditBalance(db, participant.id), 100);
});

test('ten-award monthly limit', () => {
  const { db, admin, participant, hubId } = readyPilot();
  for (let day = 1; day <= 10; day += 1) {
    const date = `2026-09-${String(day).padStart(2, '0')}`;
    const result = acceptPair(db, admin, participant, { date, hubId });
    assert.equal(result.award.credits, 100, date);
  }
  const extra = acceptPair(db, admin, participant, { date: '2026-09-11', hubId });
  assert.equal(extra.award.awarded, false);
  assert.ok(extra.award.reasons.includes('MONTHLY_LIMIT'));
  assert.equal(creditBalance(db, participant.id), 1000);
});

test('daylight-saving and timezone boundaries use America/Los_Angeles', () => {
  const spring = '2026-03-08T12:00:00.000Z'; // 5:00 a.m. PDT after spring-forward
  const fall = '2026-11-01T08:30:00.000Z'; // 1:30 a.m. PST
  const lateUtc = '2026-09-15T06:45:00.000Z'; // 11:45 p.m. PDT on Sept 14
  assert.equal(localCalendarDate(spring), '2026-03-08');
  assert.equal(localCalendarDate(fall), '2026-11-01');
  assert.equal(localCalendarDate(lateUtc), '2026-09-14');
  assert.equal(isPeakStart(spring), false);
  const { db, admin, participant, hubId } = readyPilot();
  const result = acceptPair(db, admin, participant, { date: '2026-09-14', hubId, startAt: lateUtc });
  assert.equal(result.award.credits, 100);
});

test('duplicate evidence fingerprints are rejected', () => {
  const { db, participant, hubId } = readyPilot();
  const payload = {
    hubId,
    chargingDate: '2026-09-02',
    startAt: offPeakStart('2026-09-02'),
    energyKwh: '6.0',
    evidenceSource: 'receipt',
    sessionIdentifier: 'dup-1',
  };
  submitChargingEvidence(db, participant, payload);
  assert.throws(() => submitChargingEvidence(db, participant, payload), (error) => error instanceof PilotError && error.code === 'DUPLICATE_EVIDENCE');
});

test('repeated award evaluation is idempotent', () => {
  const { db, admin, participant, hubId } = readyPilot();
  const first = acceptPair(db, admin, participant, { date: '2026-09-03', hubId });
  const again = evaluateAward(db, admin, first.evidence.id);
  assert.equal(again.id, first.award.id);
  assert.equal(creditBalance(db, participant.id), 100);
});

test('concurrent award attempts issue a single 100-credit row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pilot-'));
  const path = join(dir, 'pilot.sqlite');
  const setup = openDatabase(path);
  applyMigrations(setup);
  seedDatabase(setup);
  const admin = setup.prepare("SELECT * FROM users WHERE id = 'user-admin-01'").get();
  const participant = setup.prepare("SELECT * FROM users WHERE id = 'user-participant-a'").get();
  activatePilot(setup, admin, { effectiveAt: '2026-09-01T07:00:00.000Z' });
  for (const item of CHECKLIST_ITEMS) completeChecklistItem(setup, admin, 'hub-marengo-charging-plaza', item.key);
  activateHub(setup, admin, 'hub-marengo-charging-plaza');
  const commute = submitCommuteEvidence(setup, participant, {
    commuteDate: '2026-09-04',
    originZone: 'East Pasadena',
    destination: 'Worksite',
    travelMode: 'battery_electric_vehicle',
    attestation: true,
  });
  reviewEvidence(setup, admin, { type: 'commute', id: commute.id, decision: 'accepted' });
  const charging = submitChargingEvidence(setup, participant, {
    hubId: 'hub-marengo-charging-plaza',
    chargingDate: '2026-09-04',
    startAt: offPeakStart('2026-09-04'),
    energyKwh: '5.5',
    evidenceSource: 'session_record',
    sessionIdentifier: 'concurrent',
  });
  setup.prepare("UPDATE charging_evidence SET decision = 'accepted', reviewer_id = ?, reviewed_at = ? WHERE id = ?")
    .run(admin.id, new Date().toISOString(), charging.id);
  setup.close();

  const db1 = openDatabase(path);
  const db2 = openDatabase(path);
  const admin1 = db1.prepare("SELECT * FROM users WHERE id = 'user-admin-01'").get();
  const admin2 = db2.prepare("SELECT * FROM users WHERE id = 'user-admin-01'").get();
  evaluateAward(db1, admin1, charging.id);
  evaluateAward(db2, admin2, charging.id);
  const count = db2.prepare("SELECT COUNT(*) AS n FROM awards WHERE status = 'awarded'").get().n;
  assert.equal(count, 1);
  assert.equal(creditBalance(db2, 'user-participant-a'), 100);
  db1.close();
  db2.close();
});

test('insufficient credit balance cannot redeem', () => {
  const { db, participant } = readyPilot();
  assert.throws(() => requestRedemption(db, participant, { credits: 500, deliveryMethod: 'voucher' }), (error) => error.code === 'INSUFFICIENT_CREDITS');
});

test('only $5 and $10 redemptions are allowed', () => {
  const { db, admin, participant, hubId } = readyPilot();
  for (let day = 1; day <= 5; day += 1) {
    acceptPair(db, admin, participant, { date: `2026-09-${String(day).padStart(2, '0')}`, hubId });
  }
  assert.throws(() => requestRedemption(db, participant, { credits: 700, deliveryMethod: 'voucher' }), (error) => error.code === 'INVALID_REDEMPTION');
  const created = requestRedemption(db, participant, { credits: 500, deliveryMethod: 'voucher' });
  assert.equal(created.benefit_cents, 500);
});

test('illegal status transitions are rejected', () => {
  const { db, admin, participant, hubId } = readyPilot();
  for (let day = 1; day <= 5; day += 1) acceptPair(db, admin, participant, { date: `2026-09-${String(day).padStart(2, '0')}`, hubId });
  const redemption = requestRedemption(db, participant, { credits: 500, deliveryMethod: 'voucher' });
  assert.throws(
    () => transitionRedemption(db, admin, { redemptionId: redemption.id, action: 'approve' }),
    (error) => error.code === 'ILLEGAL_TRANSITION',
  );
});

test('hub activation requires a complete checklist', () => {
  const { db, admin } = memoryPilot();
  assert.throws(() => activateHub(db, admin, 'hub-arroyo-ev-charging-depot'), (error) => error.code === 'CHECKLIST_INCOMPLETE');
});

test('inactive-hub charging submission is rejected', () => {
  const { db, admin, participant } = memoryPilot();
  activatePilot(db, admin, { effectiveAt: '2026-09-01T07:00:00.000Z' });
  assert.throws(
    () => submitChargingEvidence(db, participant, {
      hubId: 'hub-marengo-charging-plaza',
      startAt: offPeakStart('2026-09-02'),
      energyKwh: '5.0',
      evidenceSource: 'receipt',
      sessionIdentifier: 'inactive',
    }),
    (error) => error.code === 'HUB_INACTIVE',
  );
});

test('sponsor budget cannot be oversubscribed beyond $500', () => {
  const { db, admin, participant, riderB } = readyPilot();
  const grant = (user, credits) => {
    db.prepare(`INSERT INTO credit_ledger (tenant_id, participant_id, entry_type, amount_credits, actor_id, correlation_id, note, created_at)
      VALUES (?, ?, 'earned', ?, ?, ?, 'test grant', ?)`).run(user.tenant_id, user.id, credits, admin.id, crypto.randomUUID(), new Date().toISOString());
  };
  grant(participant, 25_000);
  grant(riderB, 26_000);
  const requests = [];
  for (let i = 0; i < 25; i += 1) {
    requests.push(requestRedemption(db, participant, { credits: 1000, deliveryMethod: 'voucher', idempotencyKey: `p-${i}` }));
  }
  for (let i = 0; i < 26; i += 1) {
    requests.push(requestRedemption(db, riderB, { credits: 1000, deliveryMethod: 'voucher', idempotencyKey: `b-${i}` }));
  }
  let approved = 0;
  let exceeded = 0;
  for (const redemption of requests) {
    transitionRedemption(db, admin, { redemptionId: redemption.id, action: 'begin_review' });
    try {
      transitionRedemption(db, admin, { redemptionId: redemption.id, action: 'approve' });
      approved += 1;
    } catch (error) {
      assert.equal(error.code, 'BUDGET_EXCEEDED');
      exceeded += 1;
    }
  }
  assert.equal(approved, 50);
  assert.equal(exceeded, 1);
  assert.equal(budgetSnapshot(db).available, 0);
  assert.equal(budgetSnapshot(db).reserved, FUNDED_CENTS);
});

test('reservation release, reversal, and ledger reconciliation', () => {
  const { db, admin, participant, hubId } = readyPilot();
  for (let day = 1; day <= 10; day += 1) acceptPair(db, admin, participant, { date: `2026-09-${String(day).padStart(2, '0')}`, hubId });
  const denied = requestRedemption(db, participant, { credits: 500, deliveryMethod: 'voucher' });
  transitionRedemption(db, admin, { redemptionId: denied.id, action: 'begin_review' });
  transitionRedemption(db, admin, { redemptionId: denied.id, action: 'deny', reason: 'insufficient evidence' });
  assert.equal(creditBalance(db, participant.id), 1000);

  const voucher = requestRedemption(db, participant, { credits: 500, deliveryMethod: 'voucher' });
  transitionRedemption(db, admin, { redemptionId: voucher.id, action: 'begin_review' });
  transitionRedemption(db, admin, { redemptionId: voucher.id, action: 'approve' });
  assert.equal(budgetSnapshot(db).reserved, 500);
  transitionRedemption(db, admin, {
    redemptionId: voucher.id,
    action: 'issue_benefit',
    delivery: {
      voucherProvider: 'manual-sponsor-desk',
      voucherIdentifier: 'VCH-1001',
      faceValueCents: 500,
      issueDate: '2026-09-20',
      expirationDate: '2026-10-18',
    },
  });
  transitionRedemption(db, admin, { redemptionId: voucher.id, action: 'settle' });
  assert.equal(creditBalance(db, participant.id), 500);
  assert.equal(budgetSnapshot(db).settled, 500);
  assert.equal(budgetSnapshot(db).controlTotal, 0);

  transitionRedemption(db, admin, { redemptionId: voucher.id, action: 'reverse', reason: 'sponsor correction' });
  assert.equal(creditBalance(db, participant.id), 1000);
  assert.equal(budgetSnapshot(db).available, FUNDED_CENTS);
  assert.equal(budgetSnapshot(db).controlTotal, 0);
});

test('monthly report control totals reconcile to ledgers', () => {
  const { db, admin, participant, hubId } = readyPilot();
  acceptPair(db, admin, participant, { date: '2026-09-02', hubId });
  const report = monthlyReport(db, admin, '2026-09');
  assert.equal(report.creditsEarned, 100);
  assert.equal(report.ledgerControlTotal, 0);
  assert.equal(report.sponsor, 'Common Pathways Technologies');
  assert.equal(report.qualifyingChargingSessions, 1);
});

test('kWh conversion stays in integer watt-hours', () => {
  assert.equal(kWhToWh('5.0'), 5000);
  assert.equal(kWhToWh('5.125'), 5125);
  assert.throws(() => kWhToWh('5.1254'));
});
