import test from 'node:test';
import assert from 'node:assert/strict';
import { displayBalance } from './greenWallet.js';
import { conversionCopy, canTransition, redemptionOption } from '../shared/contract.js';

test('participant display helpers use integer credits and fixed conversion copy', () => {
  const view = displayBalance(350);
  assert.equal(view.conversion, conversionCopy());
  assert.equal(view.progress.remaining, 150);
  assert.equal(view.progress.nextCredits, 500);
});

test('redemption options are only $5 and $10', () => {
  assert.equal(redemptionOption(500).benefitCents, 500);
  assert.equal(redemptionOption(1000).benefitCents, 1000);
  assert.equal(redemptionOption(700), null);
});

test('canonical redemption machine rejects skipped approval', () => {
  assert.equal(canTransition('requested', 'approved'), false);
  assert.equal(canTransition('requested', 'under_review'), true);
  assert.equal(canTransition('under_review', 'approved'), true);
});
