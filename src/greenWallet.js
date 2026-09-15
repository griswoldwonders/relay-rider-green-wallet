import { conversionCopy, progressToNextRedemption, REDEMPTION_OPTIONS } from '../shared/contract.js';

export function displayBalance(availableCredits) {
  return {
    availableCredits,
    conversion: conversionCopy(),
    progress: progressToNextRedemption(availableCredits),
    options: REDEMPTION_OPTIONS,
  };
}
