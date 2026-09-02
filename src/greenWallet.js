// Green Wallet reference client fixtures.
// Canonical domain ownership lives in relay-rider-beta-001 Django models/API.
// These objects are synthetic contract fixtures only; they are not a second
// persistence layer and must not define independent business truth.

export const CREDIT_STATUSES = { issued: 'issued', redeemed: 'redeemed', expired: 'expired' };
export const REDEMPTION_STATUSES = { requested: 'requested', under_review: 'under-review', fulfilled: 'fulfilled', denied: 'denied' };
export const CHARGING_HUB_STATUSES = { candidate: 'candidate', verified: 'verified', active: 'active' };
export const EVIDENCE_LABELS = { synthetic: 'synthetic', modeled: 'modeled', verified: 'verified' };

export const CHARGING_HUB_NETWORKS = ['ChargePoint', 'EVgo', 'Electrify America', 'Institution-operated'];

export const seedChargingHubs = [
  { id: 'hub-pasadena-city-hall', name: 'Pasadena City Hall Charging Hub', network: 'Institution-operated', city: 'Pasadena', stalls: 6, connectorTypes: ['J1772', 'CCS'], evidenceLabel: EVIDENCE_LABELS.modeled, status: CHARGING_HUB_STATUSES.candidate },
  { id: 'hub-glendale-transit', name: 'Glendale Transit Center Charging Hub', network: 'ChargePoint', city: 'Glendale', stalls: 4, connectorTypes: ['J1772'], evidenceLabel: EVIDENCE_LABELS.modeled, status: CHARGING_HUB_STATUSES.candidate },
  { id: 'hub-eagle-rock-plaza', name: 'Eagle Rock Plaza Charging Hub', network: 'EVgo', city: 'Eagle Rock', stalls: 4, connectorTypes: ['CCS', 'CHAdeMO'], evidenceLabel: EVIDENCE_LABELS.modeled, status: CHARGING_HUB_STATUSES.candidate },
];

function creditId(n) { return `gwc-${String(n).padStart(4, '0')}`; }
function requestId(n) { return `gwr-${String(n).padStart(4, '0')}`; }

// Participant-facing credit projection. amountUnits is a program-defined,
// non-monetary incentive quantity and is never inferred from miles or CO2.
export const seedGreenWalletCredits = [
  { id: creditId(1), participantId: 'participant-demo-01', participantName: 'Demo Participant A', activity: 'Research-beta participation', amountUnits: 15, unitLabel: 'Green Route Credits', status: CREDIT_STATUSES.issued, issuedAt: '2026-08-10T12:00:00Z', evidenceLabel: EVIDENCE_LABELS.synthetic },
  { id: creditId(2), participantId: 'participant-demo-02', participantName: 'Demo Participant B', activity: 'Research-beta participation', amountUnits: 10, unitLabel: 'Green Route Credits', status: CREDIT_STATUSES.issued, issuedAt: '2026-08-14T12:00:00Z', evidenceLabel: EVIDENCE_LABELS.synthetic },
  { id: creditId(3), participantId: 'participant-demo-03', participantName: 'Demo Participant C', activity: 'Research-beta participation', amountUnits: 20, unitLabel: 'Green Route Credits', status: CREDIT_STATUSES.redeemed, issuedAt: '2026-08-05T12:00:00Z', evidenceLabel: EVIDENCE_LABELS.synthetic },
];

// Redemption lifecycle is a separate object from the credit lifecycle.
export const seedRedemptionRequests = [
  { id: requestId(1), creditId: creditId(2), participantId: 'participant-demo-02', chargingHubId: 'hub-glendale-transit', requestedUnits: 10, unitLabel: 'Green Route Credits', status: REDEMPTION_STATUSES.requested, requestedAt: '2026-08-15T12:00:00Z', reviewedAt: null, reviewedBy: null, reviewNote: '' },
  { id: requestId(2), creditId: creditId(3), participantId: 'participant-demo-03', chargingHubId: 'hub-pasadena-city-hall', requestedUnits: 20, unitLabel: 'Green Route Credits', status: REDEMPTION_STATUSES.fulfilled, requestedAt: '2026-08-08T12:00:00Z', reviewedAt: '2026-08-09T12:00:00Z', reviewedBy: 'demo-program-admin', reviewNote: 'Synthetic research-beta fulfillment.' },
];

export function walletBalance(credits, participantId, requests = []) {
  const unavailableCreditIds = new Set(
    requests
      .filter((request) => request.status !== REDEMPTION_STATUSES.denied)
      .map((request) => request.creditId),
  );
  return credits
    .filter((credit) => credit.participantId === participantId && credit.status === CREDIT_STATUSES.issued && !unavailableCreditIds.has(credit.id))
    .reduce((sum, credit) => sum + credit.amountUnits, 0);
}

// Fixture helpers mimic commands sent to the canonical backend. They are for
// prototype UI behavior only and do not replace server-side validation/RBAC.
export function requestRedemption(requests, input) {
  return [...requests, { ...input, id: requestId(requests.length + 1), status: REDEMPTION_STATUSES.requested, requestedAt: new Date().toISOString(), reviewedAt: null, reviewedBy: null, reviewNote: '' }];
}

export function startRedemptionReview(requests, id) {
  return requests.map((r) => r.id === id && r.status === REDEMPTION_STATUSES.requested ? { ...r, status: REDEMPTION_STATUSES.under_review } : r);
}

export function reviewRedemption(requests, id, decision, note = '') {
  if (![REDEMPTION_STATUSES.fulfilled, REDEMPTION_STATUSES.denied].includes(decision)) return requests;
  return requests.map((r) => r.id === id && r.status === REDEMPTION_STATUSES.under_review ? { ...r, status: decision, reviewNote: note || r.reviewNote } : r);
}
