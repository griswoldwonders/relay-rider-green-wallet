// Canonical Manual Pasadena Charging-Benefit Pilot contract.
// Credits and cents are integers. Do not use floating-point for money or credits.

export const TIMEZONE = 'America/Los_Angeles';
export const SPONSOR_NAME = 'Common Pathways Technologies';
export const FUNDED_CENTS = 50_000; // $500
export const FUNDED_CREDITS = 50_000;
export const CREDITS_PER_DOLLAR = 100;
export const AWARD_CREDITS = 100;
export const MIN_ENERGY_WH = 5_000; // 5.0 kWh
export const PEAK_START_MINUTES = 16 * 60; // 4:00 p.m.
export const PEAK_END_MINUTES = 21 * 60; // 9:00 p.m. exclusive
export const MAX_AWARDS_PER_DAY = 1;
export const MAX_AWARDS_PER_MONTH = 10;
export const MAX_CREDITS_PER_MONTH = 1_000;
export const DEFAULT_PILOT_DAYS = 90;
export const REDEMPTION_OPTIONS = Object.freeze([
  { credits: 500, benefitCents: 500, label: '$5 benefit' },
  { credits: 1_000, benefitCents: 1_000, label: '$10 benefit' },
]);

export const USER_ROLES = Object.freeze({
  participant: 'participant',
  administrator: 'administrator',
});

export const CREDIT_LEDGER_TYPES = Object.freeze({
  earned: 'earned',
  reserved: 'reserved',
  released: 'released',
  redeemed: 'redeemed',
  reversed: 'reversed',
  expired: 'expired',
});

export const BUDGET_LEDGER_TYPES = Object.freeze({
  funded: 'funded',
  reserved: 'reserved',
  issued: 'issued',
  settled: 'settled',
  released: 'released',
  reversed: 'reversed',
});

export const REDEMPTION_STATUSES = Object.freeze({
  requested: 'requested',
  under_review: 'under_review',
  approved: 'approved',
  benefit_issued: 'benefit_issued',
  session_verification_pending: 'session_verification_pending',
  settled: 'settled',
  denied: 'denied',
  expired_unused: 'expired_unused',
  delivery_failed: 'delivery_failed',
  verification_required: 'verification_required',
  disputed: 'disputed',
  reversed: 'reversed',
});

export const REDEMPTION_TRANSITIONS = Object.freeze({
  requested: ['under_review', 'denied', 'expired_unused', 'verification_required'],
  under_review: ['approved', 'denied', 'verification_required', 'disputed'],
  approved: ['benefit_issued', 'session_verification_pending', 'delivery_failed', 'expired_unused', 'disputed'],
  benefit_issued: ['settled', 'session_verification_pending', 'delivery_failed', 'disputed'],
  session_verification_pending: ['settled', 'benefit_issued', 'verification_required', 'disputed', 'denied'],
  settled: ['disputed', 'reversed'],
  denied: ['disputed'],
  expired_unused: ['disputed'],
  delivery_failed: ['under_review', 'disputed', 'expired_unused'],
  verification_required: ['under_review', 'denied', 'disputed'],
  disputed: ['under_review', 'reversed', 'denied', 'settled'],
  reversed: [],
});

export const ADMIN_REDEMPTION_ACTIONS = Object.freeze({
  begin_review: 'begin_review',
  approve: 'approve',
  deny: 'deny',
  require_verification: 'require_verification',
  mark_session_verification_pending: 'mark_session_verification_pending',
  issue_benefit: 'issue_benefit',
  settle: 'settle',
  mark_expired: 'mark_expired',
  mark_delivery_failed: 'mark_delivery_failed',
  dispute: 'dispute',
  reverse: 'reverse',
});

export const ACTION_TO_STATUS = Object.freeze({
  begin_review: REDEMPTION_STATUSES.under_review,
  approve: REDEMPTION_STATUSES.approved,
  deny: REDEMPTION_STATUSES.denied,
  require_verification: REDEMPTION_STATUSES.verification_required,
  mark_session_verification_pending: REDEMPTION_STATUSES.session_verification_pending,
  issue_benefit: REDEMPTION_STATUSES.benefit_issued,
  settle: REDEMPTION_STATUSES.settled,
  mark_expired: REDEMPTION_STATUSES.expired_unused,
  mark_delivery_failed: REDEMPTION_STATUSES.delivery_failed,
  dispute: REDEMPTION_STATUSES.disputed,
  reverse: REDEMPTION_STATUSES.reversed,
});

export const PARTICIPANT_REDEMPTION_ACTIONS = Object.freeze({
  confirm_receipt: 'confirm_receipt',
});

export const HUB_VERIFICATION_STATUSES = Object.freeze({
  location_verified: 'location_verified',
  unverified: 'unverified',
});

export const HUB_ACTIVATION_STATUSES = Object.freeze({
  pending: 'pending',
  active: 'active',
  inactive: 'inactive',
});

export const EVIDENCE_DECISIONS = Object.freeze({
  pending: 'pending',
  accepted: 'accepted',
  denied: 'denied',
});

export const DELIVERY_METHODS = Object.freeze({
  voucher: 'voucher',
  receipt: 'receipt',
});

export const CHECKLIST_ITEMS = Object.freeze([
  { key: 'physical_address_confirmed', label: 'Physical address confirmed' },
  { key: 'public_access_terms_reviewed', label: 'Public access terms reviewed' },
  { key: 'operating_hours_confirmed', label: 'Operating hours confirmed' },
  { key: 'charger_network_operator_identified', label: 'Charger/network operator identified' },
  { key: 'current_pricing_reviewed', label: 'Current pricing reviewed' },
  { key: 'receipt_or_session_record_availability_confirmed', label: 'Receipt or session record availability confirmed' },
  { key: 'minimum_evidence_fields_confirmed', label: 'Minimum evidence fields confirmed' },
  { key: 'voucher_acceptance_or_reimbursement_method_confirmed', label: 'Voucher acceptance or reimbursement method confirmed' },
  { key: 'sponsor_approval_recorded', label: 'Sponsor approval recorded' },
  { key: 'pilot_budget_availability_confirmed', label: 'Pilot budget availability confirmed' },
  { key: 'participant_instructions_published', label: 'Participant instructions published' },
  { key: 'privacy_and_evidence_retention_rules_configured', label: 'Privacy and evidence-retention rules configured' },
  { key: 'dispute_contact_configured', label: 'Dispute contact configured' },
  { key: 'hub_activation_approved_by_authorized_administrator', label: 'Hub activation approved by an authorized administrator' },
]);

export const SEED_HUBS = Object.freeze([
  {
    id: 'hub-marengo-charging-plaza',
    name: 'Marengo Charging Plaza',
    addressLine: '155 E. Green Street',
    city: 'Pasadena',
    state: 'CA',
    verificationStatus: HUB_VERIFICATION_STATUSES.location_verified,
    activationStatus: HUB_ACTIVATION_STATUSES.pending,
  },
  {
    id: 'hub-arroyo-ev-charging-depot',
    name: 'Arroyo EV Charging Depot',
    addressLine: '64 E. Glenarm Street',
    city: 'Pasadena',
    state: 'CA',
    verificationStatus: HUB_VERIFICATION_STATUSES.location_verified,
    activationStatus: HUB_ACTIVATION_STATUSES.pending,
  },
]);

export function canTransition(from, to) {
  return Boolean(REDEMPTION_TRANSITIONS[from]?.includes(to));
}

export function redemptionOption(credits) {
  return REDEMPTION_OPTIONS.find((option) => option.credits === Number(credits)) ?? null;
}

export function creditsToBenefitCents(credits) {
  const option = redemptionOption(credits);
  return option ? option.benefitCents : null;
}

export function kWhToWh(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,3})?$/.test(text)) {
    throw new Error('energy_kwh must be a non-negative decimal with at most 3 fractional digits');
  }
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 1000 + Number((fraction + '000').slice(0, 3));
}

export function whToKwhLabel(wh) {
  const whole = Math.trunc(wh / 1000);
  const frac = String(wh % 1000).padStart(3, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

export function zonedParts(isoOrDate, timeZone = TIMEZONE) {
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) throw new Error('invalid timestamp');
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    month: `${parts.year}-${parts.month}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function isPeakStart(isoOrDate, timeZone = TIMEZONE) {
  const minutes = zonedParts(isoOrDate, timeZone).minutes;
  return minutes >= PEAK_START_MINUTES && minutes < PEAK_END_MINUTES;
}

export function localCalendarDate(isoOrDate, timeZone = TIMEZONE) {
  return zonedParts(isoOrDate, timeZone).date;
}

export function localMonth(isoOrDate, timeZone = TIMEZONE) {
  return zonedParts(isoOrDate, timeZone).month;
}

export function progressToNextRedemption(availableCredits) {
  const next = REDEMPTION_OPTIONS.find((option) => availableCredits < option.credits) ?? null;
  if (!next) {
    return { nextCredits: null, remaining: 0, readyFor: REDEMPTION_OPTIONS.filter((option) => availableCredits >= option.credits) };
  }
  return { nextCredits: next.credits, remaining: next.credits - availableCredits, readyFor: REDEMPTION_OPTIONS.filter((option) => availableCredits >= option.credits) };
}

export function conversionCopy() {
  return '100 credits = $1 in eligible charging benefits';
}
