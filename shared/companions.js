export const AQMD_FEED_CONTRACT = 'rr-aqmd-feed-v1';
export const COMMUTE_INGEST_CONTRACT = 'rr-gw-commute-evidence-v1';
export const AWARD_EVENT_CONTRACT = 'gw-award-created-v1';

export const COMPANIONS = Object.freeze({
  relayRiderBeta: {
    id: 'relay_rider_beta',
    name: 'Relay Rider beta',
    repo: 'https://github.com/griswoldwonders/relay-rider-beta-001',
    owns: [
      'institution and membership context',
      'validated commuter records',
      'AQMD downstream feed producer (rr-aqmd-feed-v1)',
      'corridor / site / cohort identifiers',
    ],
    doesNotOwn: [
      'Pasadena charging-benefit credit ledger',
      'kWh session awards',
      'sponsor $500 budget',
    ],
  },
  aqmdModule: {
    id: 'aqmd_module',
    name: 'AQMD module tool',
    repo: 'https://github.com/griswoldwonders/aqmd-module-tool',
    owns: [
      'South Coast AQMD Rule 2202 analysis',
      'institutional TDM / AVR / VMT reporting packages',
      'read-only consumption of the Relay Rider AQMD feed',
    ],
    doesNotOwn: [
      'credit minting',
      'charging session kWh',
      'redemptions or sponsor settlement',
      'writes back to Relay Rider beta',
    ],
  },
  greenWallet: {
    id: 'green_wallet',
    name: 'Green Wallet Pasadena pilot',
    repo: 'https://github.com/griswoldwonders/relay-rider-green-wallet',
    owns: [
      'Qualifying Clean Commute and Charging Day awards',
      'append-only credit and sponsor-budget ledgers',
      'charging evidence, hub activation, $5/$10 redemptions',
    ],
    doesNotOwn: [
      'Rule 2202 certification',
      'Relay Rider commuter system of record',
    ],
  },
});

export function isElectricFuelType(value) {
  const normalized = String(value || '').toLowerCase().replaceAll(/[\s-]+/g, '_');
  return ['ev', 'bev', 'battery_electric', 'battery_electric_vehicle', 'plug_in_hybrid', 'phev'].includes(normalized);
}

export function commuteDateFromFeedRecord(record) {
  if (record.commute_date && /^\d{4}-\d{2}-\d{2}$/.test(record.commute_date)) {
    return { date: record.commute_date, provenance: 'explicit_commute_date' };
  }
  if (record.observation_date && /^\d{4}-\d{2}-\d{2}$/.test(record.observation_date)) {
    return { date: record.observation_date, provenance: 'observation_date' };
  }
  const stamp = record.record_updated_at || record.record_created_at;
  if (stamp && /^\d{4}-\d{2}-\d{2}/.test(stamp)) {
    return { date: stamp.slice(0, 10), provenance: 'feed_timestamp_estimated' };
  }
  return null;
}
