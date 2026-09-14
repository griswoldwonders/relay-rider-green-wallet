import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dollars,
  estimateClaim,
  isWeekdayIsoDate,
  kwhLabel,
  parseKwhToTenths,
  parseMoneyToCents,
  remainingFromLedger,
  seedLedger,
  validateClaimForm,
} from './program.js';

test('claim estimate excludes idle parking and tax and applies session and remaining caps', () => {
  const result = estimateClaim({
    energyChargeCents: 1480,
    idleFeeCents: 150,
    parkingFeeCents: 40,
    taxCents: 20,
    remainingCents: 1860,
  });
  assert.equal(result.excludedCents, 210);
  assert.equal(result.eligibleEnergyCents, 1480);
  assert.equal(result.estimatedCents, 1200);
});

test('claim never exceeds remaining monthly dollars', () => {
  const result = estimateClaim({ energyChargeCents: 1480, remainingCents: 800 });
  assert.equal(result.estimatedCents, 800);
});

test('weekday commute rule', () => {
  assert.equal(isWeekdayIsoDate('2026-09-14'), true);
  assert.equal(isWeekdayIsoDate('2026-09-13'), false);
});

test('integer money and kWh parsing', () => {
  assert.equal(parseMoneyToCents('14.80'), 1480);
  assert.equal(parseKwhToTenths('31.4'), 314);
  assert.equal(dollars(1860), '$18.60');
  assert.equal(kwhLabel(314), '31.4');
});

test('seed ledger contains the specified demo activity', () => {
  const ledger = seedLedger();
  assert.equal(ledger[0].amountCents, 3000);
  assert.equal(ledger.find((row) => row.date === '2026-09-08').status, 'redeemed');
  const remaining = remainingFromLedger(ledger);
  assert.ok(remaining.consumedCents >= 640);
});

test('claim form requires commute attestation and exclusions', () => {
  const invalid = validateClaimForm({ network: '', locationName: '', commuteRelated: false, exclusionsAcknowledged: false });
  assert.ok(invalid.errors.length > 3);
  const valid = validateClaimForm({
    network: 'Demo Partner Network',
    locationName: 'Pasadena Transit Hub Charging',
    cityCorridor: 'Pasadena corridor',
    sessionDate: '2026-09-15',
    startTime: '07:40',
    energyKwh: '9.6',
    energyCharge: '14.80',
    commuteRelated: true,
    exclusionsAcknowledged: true,
  });
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.energyChargeCents, 1480);
});
