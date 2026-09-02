import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CREDIT_STATUSES,
  REDEMPTION_STATUSES,
  CHARGING_HUB_STATUSES,
  EVIDENCE_LABELS,
  seedChargingHubs,
  seedGreenWalletCredits,
  seedRedemptionRequests,
  walletBalance,
  requestRedemption,
  startRedemptionReview,
  reviewRedemption,
} from './greenWallet.js';

test('fixtures use canonical lowercase machine vocabularies', () => {
  for (const hub of seedChargingHubs) {
    assert.ok(Object.values(CHARGING_HUB_STATUSES).includes(hub.status));
    assert.ok(Object.values(EVIDENCE_LABELS).includes(hub.evidenceLabel));
  }
  for (const credit of seedGreenWalletCredits) {
    assert.ok(Object.values(CREDIT_STATUSES).includes(credit.status));
    assert.equal(typeof credit.amountUnits, 'number');
    assert.equal(credit.unitLabel, 'Green Route Credits');
    assert.ok(credit.issuedAt);
  }
  for (const request of seedRedemptionRequests) {
    assert.ok(Object.values(REDEMPTION_STATUSES).includes(request.status));
  }
});

test('wallet balance includes only issued credit units', () => {
  const credits = [
    { participantId: 'p1', amountUnits: 5, status: CREDIT_STATUSES.issued },
    { participantId: 'p1', amountUnits: 7, status: CREDIT_STATUSES.redeemed },
    { participantId: 'p2', amountUnits: 9, status: CREDIT_STATUSES.issued },
  ];
  assert.equal(walletBalance(credits, 'p1'), 5);
});

test('redemption request is separate from credit issuance and starts requested', () => {
  const existing = [];
  const created = requestRedemption(existing, {
    creditId: 'gwc-0001',
    participantId: 'p1',
    chargingHubId: 'hub-1',
    requestedUnits: 5,
    unitLabel: 'Green Route Credits',
  });
  assert.equal(existing.length, 0);
  assert.equal(created.length, 1);
  assert.equal(created[0].status, REDEMPTION_STATUSES.requested);
});

test('redemption follows requested to under-review to fulfilled', () => {
  const requested = requestRedemption([], {
    creditId: 'gwc-0001',
    participantId: 'p1',
    chargingHubId: 'hub-1',
    requestedUnits: 5,
    unitLabel: 'Green Route Credits',
  });
  const reviewing = startRedemptionReview(requested, requested[0].id);
  assert.equal(reviewing[0].status, REDEMPTION_STATUSES.under_review);
  const fulfilled = reviewRedemption(reviewing, requested[0].id, REDEMPTION_STATUSES.fulfilled, 'Reviewed');
  assert.equal(fulfilled[0].status, REDEMPTION_STATUSES.fulfilled);
  assert.equal(fulfilled[0].reviewNote, 'Reviewed');
});

test('terminal decision cannot skip under-review fixture state', () => {
  const requested = requestRedemption([], {
    creditId: 'gwc-0001',
    participantId: 'p1',
    chargingHubId: 'hub-1',
    requestedUnits: 5,
    unitLabel: 'Green Route Credits',
  });
  const result = reviewRedemption(requested, requested[0].id, REDEMPTION_STATUSES.fulfilled, 'Should not apply');
  assert.equal(result[0].status, REDEMPTION_STATUSES.requested);
});
