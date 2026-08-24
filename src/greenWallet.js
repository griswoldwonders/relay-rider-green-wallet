// Green Wallet: EV Charge Credit model.
//
// Evidence label: Prototype scoring model / For pilot review only.
// Green Wallet credit is a non-monetary program incentive issued by the
// sponsoring institution's program budget. It is not currency, not a fare,
// and not a live payment instrument. Redemption is always subject to
// administrative review before a credit is marked fulfilled.
//
// See docs/GREEN_WALLET_SPEC.md in this repository for the full spec,
// terminology, and guardrails this model must respect.

export const CREDIT_STATUSES = {
  issued: "Issued",
  redemption_requested: "Redemption requested",
  under_review: "Under administrative review",
  fulfilled: "Fulfilled",
  denied: "Denied"
};

export const CHARGING_HUB_NETWORKS = [
  "ChargePoint",
  "EVgo",
  "Electrify America",
  "Institution-operated"
];

/**
 * ChargingHub: a partner or institution-operated location where a
 * participant can redeem EV Charge Credit. Location data mirrors the
 * evidence-labeled AccessPoint pattern used elsewhere in the product.
 */
export const seedChargingHubs = [
  {
    id: "hub-pasadena-city-hall",
    name: "Pasadena City Hall Charging Hub",
    network: "Institution-operated",
    city: "Pasadena",
    stalls: 6,
    connectorTypes: ["J1772", "CCS"],
    evidenceLabel: "Modeled",
    status: "Candidate"
  },
  {
    id: "hub-glendale-transit",
    name: "Glendale Transit Center Charging Hub",
    network: "ChargePoint",
    city: "Glendale",
    stalls: 4,
    connectorTypes: ["J1772"],
    evidenceLabel: "Modeled",
    status: "Candidate"
  },
  {
    id: "hub-eagle-rock-plaza",
    name: "Eagle Rock Plaza Charging Hub",
    network: "EVgo",
    city: "Eagle Rock",
    stalls: 4,
    connectorTypes: ["CCS", "CHAdeMO"],
    evidenceLabel: "Modeled",
    status: "Candidate"
  }
];

/**
 * GreenWalletCredit: one issued credit ledger entry for a participant.
 * `amountUnits` is a program-defined incentive unit, not a dollar amount.
 * Programs may choose to label units as "kWh credit" or "session credit";
 * the founder must approve the unit definition before pilot launch.
 */
function creditId(n) {
  return `gwc-${String(n).padStart(4, "0")}`;
}

export const seedGreenWalletCredits = [
  {
    id: creditId(1),
    participantId: "participant-demo-01",
    participantName: "Demo Participant A",
    amountUnits: 15,
    unitLabel: "kWh credit",
    issuedBy: "Program sponsor budget",
    issuedDate: "2026-08-10",
    status: CREDIT_STATUSES.issued,
    chargingHubId: null,
    reviewNote: "",
    evidenceLabel: "Synthetic"
  },
  {
    id: creditId(2),
    participantId: "participant-demo-02",
    participantName: "Demo Participant B",
    amountUnits: 10,
    unitLabel: "kWh credit",
    issuedBy: "Program sponsor budget",
    issuedDate: "2026-08-14",
    status: CREDIT_STATUSES.redemption_requested,
    chargingHubId: "hub-glendale-transit",
    reviewNote: "",
    evidenceLabel: "Synthetic"
  },
  {
    id: creditId(3),
    participantId: "participant-demo-03",
    participantName: "Demo Participant C",
    amountUnits: 20,
    unitLabel: "kWh credit",
    issuedBy: "Program sponsor budget",
    issuedDate: "2026-08-05",
    status: CREDIT_STATUSES.fulfilled,
    chargingHubId: "hub-pasadena-city-hall",
    reviewNote: "Approved 2026-08-09 by program admin.",
    evidenceLabel: "Synthetic"
  }
];

export function walletBalance(credits, participantId) {
  return credits
    .filter((c) => c.participantId === participantId && c.status !== CREDIT_STATUSES.fulfilled && c.status !== CREDIT_STATUSES.denied)
    .reduce((sum, c) => sum + c.amountUnits, 0);
}

export function requestRedemption(credits, creditId, chargingHubId) {
  return credits.map((c) =>
    c.id === creditId
      ? { ...c, status: CREDIT_STATUSES.redemption_requested, chargingHubId }
      : c
  );
}

export function reviewRedemption(credits, creditId, approve, note = "") {
  return credits.map((c) =>
    c.id === creditId
      ? {
          ...c,
          status: approve ? CREDIT_STATUSES.fulfilled : CREDIT_STATUSES.denied,
          reviewNote: note || c.reviewNote
        }
      : c
  );
}
