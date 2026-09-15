import {
  ACTION_TO_STATUS,
  AWARD_CREDITS,
  BUDGET_LEDGER_TYPES,
  CHECKLIST_ITEMS,
  CREDIT_LEDGER_TYPES,
  DEFAULT_PILOT_DAYS,
  DELIVERY_METHODS,
  EVIDENCE_DECISIONS,
  FUNDED_CENTS,
  HUB_ACTIVATION_STATUSES,
  MAX_AWARDS_PER_MONTH,
  MAX_CREDITS_PER_MONTH,
  MIN_ENERGY_WH,
  PARTICIPANT_REDEMPTION_ACTIONS,
  REDEMPTION_STATUSES,
  SEED_HUBS,
  SPONSOR_NAME,
  TIMEZONE,
  USER_ROLES,
  canTransition,
  conversionCopy,
  isPeakStart,
  kWhToWh,
  localCalendarDate,
  localMonth,
  progressToNextRedemption,
  redemptionOption,
} from '../shared/contract.js';
import { withImmediateTransaction } from './db.js';
import { companionStatus, recordOutboundAward } from './companionBridge.js';
import { PilotError, fingerprintEvidence, hashSecret, newCorrelationId, newId, nowIso } from './util.js';

function getPilot(db) {
  return db.prepare('SELECT * FROM pilot_config WHERE id = 1').get();
}

function requireAdmin(actor) {
  if (actor?.role !== USER_ROLES.administrator) {
    throw new PilotError('FORBIDDEN', 'administrator role required', 403);
  }
}

function requireParticipant(actor) {
  if (actor?.role !== USER_ROLES.participant) {
    throw new PilotError('FORBIDDEN', 'participant role required', 403);
  }
}

function audit(db, { tenantId, actorId, action, entityType, entityId, payload, correlationId }) {
  db.prepare(`INSERT INTO audit_events (tenant_id, actor_id, action, entity_type, entity_id, payload_json, correlation_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(tenantId, actorId, action, entityType, entityId ?? null, JSON.stringify(payload ?? {}), correlationId, nowIso());
}

export function creditBalance(db, participantId) {
  const row = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN entry_type IN ('earned', 'released', 'reversed') THEN amount_credits ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN entry_type IN ('reserved', 'redeemed', 'expired') THEN amount_credits ELSE 0 END), 0) AS balance
    FROM credit_ledger WHERE participant_id = ?`).get(participantId);
  return Number(row.balance);
}

export function creditTotals(db, participantId) {
  const rows = db.prepare('SELECT entry_type, SUM(amount_credits) AS total FROM credit_ledger WHERE participant_id = ? GROUP BY entry_type').all(participantId);
  const totals = Object.fromEntries(Object.keys(CREDIT_LEDGER_TYPES).map((key) => [key, 0]));
  for (const row of rows) totals[row.entry_type] = Number(row.total);
  return totals;
}

export function budgetSnapshot(db, tenantId = 'pasadena-pilot') {
  const rows = db.prepare('SELECT entry_type, SUM(amount_cents) AS total FROM budget_ledger WHERE tenant_id = ? GROUP BY entry_type').all(tenantId);
  const totals = Object.fromEntries(Object.keys(BUDGET_LEDGER_TYPES).map((key) => [key, 0]));
  for (const row of rows) totals[row.entry_type] = Number(row.total);
  const available = totals.funded + totals.released + totals.reversed - totals.reserved - totals.issued - totals.settled;
  const obligated = totals.reserved + totals.issued + totals.settled;
  return { ...totals, available, obligated, controlTotal: totals.funded + totals.released + totals.reversed - obligated - available };
}

function insertCredit(db, row) {
  db.prepare(`INSERT INTO credit_ledger (tenant_id, participant_id, entry_type, amount_credits, award_id, redemption_id, actor_id, correlation_id, note, created_at)
    VALUES (@tenant_id, @participant_id, @entry_type, @amount_credits, @award_id, @redemption_id, @actor_id, @correlation_id, @note, @created_at)`).run({
    created_at: nowIso(),
    award_id: null,
    redemption_id: null,
    note: '',
    ...row,
  });
}

function insertBudget(db, row) {
  db.prepare(`INSERT INTO budget_ledger (tenant_id, entry_type, amount_cents, redemption_id, actor_id, correlation_id, note, created_at)
    VALUES (@tenant_id, @entry_type, @amount_cents, @redemption_id, @actor_id, @correlation_id, @note, @created_at)`).run({
    created_at: nowIso(),
    redemption_id: null,
    note: '',
    ...row,
  });
}

function budgetEntriesForRedemption(db, redemptionId) {
  return db.prepare('SELECT * FROM budget_ledger WHERE redemption_id = ? ORDER BY id').all(redemptionId);
}

function netBudgetBucket(entries, type) {
  return entries.filter((entry) => entry.entry_type === type).reduce((sum, entry) => sum + entry.amount_cents, 0);
}

export function assertPilotActive(db, at = new Date()) {
  const pilot = getPilot(db);
  if (!pilot?.enabled || !pilot.activated_at) {
    throw new PilotError('PILOT_DISABLED', 'pilot is disabled until an administrator activates it', 403);
  }
  const start = new Date(pilot.effective_at || pilot.activated_at);
  const end = new Date(start.getTime() + Number(pilot.duration_days) * 24 * 60 * 60 * 1000);
  if (at < start || at > end) {
    throw new PilotError('PILOT_INACTIVE_WINDOW', 'action is outside the configured pilot term', 403);
  }
  return pilot;
}

export function activatePilot(db, actor, { effectiveAt } = {}) {
  requireAdmin(actor);
  return withImmediateTransaction(db, () => {
    const current = getPilot(db);
    const effective = effectiveAt || nowIso();
    db.prepare(`UPDATE pilot_config SET enabled = 1, effective_at = ?, activated_at = ?, activated_by = ?, updated_at = ? WHERE id = 1`)
      .run(effective, nowIso(), actor.id, nowIso());
    audit(db, {
      tenantId: actor.tenant_id,
      actorId: actor.id,
      action: 'pilot.activate',
      entityType: 'pilot_config',
      entityId: '1',
      payload: { previousEnabled: current.enabled, effectiveAt: effective },
      correlationId: newCorrelationId(),
    });
    return getPilot(db);
  });
}

export function updatePilotEffectiveDate(db, actor, effectiveAt) {
  requireAdmin(actor);
  db.prepare('UPDATE pilot_config SET effective_at = ?, updated_at = ? WHERE id = 1').run(effectiveAt, nowIso());
  return getPilot(db);
}

export function completeChecklistItem(db, actor, hubId, itemKey) {
  requireAdmin(actor);
  return withImmediateTransaction(db, () => {
    const item = db.prepare('SELECT * FROM hub_checklist_items WHERE hub_id = ? AND item_key = ?').get(hubId, itemKey);
    if (!item) throw new PilotError('NOT_FOUND', 'checklist item not found', 404);
    db.prepare('UPDATE hub_checklist_items SET completed = 1, completed_by = ?, completed_at = ? WHERE id = ?')
      .run(actor.id, nowIso(), item.id);
    audit(db, {
      tenantId: actor.tenant_id,
      actorId: actor.id,
      action: 'hub.checklist_complete',
      entityType: 'hub_checklist_items',
      entityId: item.id,
      payload: { hubId, itemKey },
      correlationId: newCorrelationId(),
    });
    return db.prepare('SELECT * FROM hub_checklist_items WHERE id = ?').get(item.id);
  });
}

export function activateHub(db, actor, hubId) {
  requireAdmin(actor);
  return withImmediateTransaction(db, () => {
    const hub = db.prepare('SELECT * FROM charging_hubs WHERE id = ?').get(hubId);
    if (!hub) throw new PilotError('NOT_FOUND', 'charging hub not found', 404);
    const incomplete = db.prepare('SELECT item_key FROM hub_checklist_items WHERE hub_id = ? AND required = 1 AND completed = 0').all(hubId);
    if (incomplete.length) {
      throw new PilotError('CHECKLIST_INCOMPLETE', 'every required Active Hub Checklist item must be completed before activation', 409);
    }
    db.prepare('UPDATE charging_hubs SET activation_status = ?, activated_at = ?, activated_by = ? WHERE id = ?')
      .run(HUB_ACTIVATION_STATUSES.active, nowIso(), actor.id, hubId);
    audit(db, {
      tenantId: actor.tenant_id,
      actorId: actor.id,
      action: 'hub.activate',
      entityType: 'charging_hubs',
      entityId: hubId,
      payload: {},
      correlationId: newCorrelationId(),
    });
    return db.prepare('SELECT * FROM charging_hubs WHERE id = ?').get(hubId);
  });
}

export function listHubs(db) {
  const hubs = db.prepare('SELECT * FROM charging_hubs ORDER BY name').all();
  return hubs.map((hub) => ({
    ...hub,
    checklist: db.prepare('SELECT * FROM hub_checklist_items WHERE hub_id = ? ORDER BY item_key').all(hub.id),
    partnershipDisclaimer: 'Location independently verified for pilot reference only. No charging-network, utility, city, or campus operator agreement is implied.',
  }));
}

export function submitCommuteEvidence(db, actor, input) {
  requireParticipant(actor);
  if (!actor.enrolled_in_pasadena_pilot) throw new PilotError('NOT_ENROLLED', 'participant is not enrolled in the Pasadena pilot', 403);
  if (!input.attestation) throw new PilotError('ATTESTATION_REQUIRED', 'participant attestation is required', 400);
  const id = newId('cme');
  db.prepare(`INSERT INTO commute_evidence (
    id, tenant_id, participant_id, commute_date, origin_zone, destination, travel_mode, vehicle_id, attestation, submitted_at, decision
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending')`).run(
    id,
    actor.tenant_id,
    actor.id,
    input.commuteDate,
    input.originZone,
    input.destination,
    input.travelMode,
    input.vehicleId || actor.vehicle_id,
    nowIso(),
  );
  return db.prepare('SELECT * FROM commute_evidence WHERE id = ?').get(id);
}

export function submitChargingEvidence(db, actor, input) {
  requireParticipant(actor);
  assertPilotActive(db);
  if (!actor.enrolled_in_pasadena_pilot) throw new PilotError('NOT_ENROLLED', 'participant is not enrolled in the Pasadena pilot', 403);
  const hub = db.prepare('SELECT * FROM charging_hubs WHERE id = ?').get(input.hubId);
  if (!hub) throw new PilotError('NOT_FOUND', 'charging hub not found', 404);
  if (hub.activation_status !== HUB_ACTIVATION_STATUSES.active) {
    throw new PilotError('HUB_INACTIVE', 'charging evidence is only accepted for administrator-activated hubs', 409);
  }
  const energyWh = Number.isInteger(input.energyWh) ? input.energyWh : kWhToWh(input.energyKwh);
  const chargingDate = input.chargingDate || localCalendarDate(input.startAt);
  const fingerprint = fingerprintEvidence({
    participantId: actor.id,
    hubId: hub.id,
    chargingDate,
    startAt: input.startAt,
    energyWh,
    sessionIdentifier: input.sessionIdentifier,
  });
  const existing = db.prepare('SELECT id FROM charging_evidence WHERE fingerprint = ?').get(fingerprint);
  if (existing) throw new PilotError('DUPLICATE_EVIDENCE', 'duplicate charging evidence fingerprint', 409);
  const id = newId('che');
  db.prepare(`INSERT INTO charging_evidence (
    id, tenant_id, participant_id, hub_id, charging_date, start_at, end_at, energy_wh, amount_charged_cents,
    session_identifier, evidence_file_id, evidence_source, fingerprint, submitted_at, decision
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`).run(
    id,
    actor.tenant_id,
    actor.id,
    hub.id,
    chargingDate,
    input.startAt,
    input.endAt ?? null,
    energyWh,
    input.amountChargedCents ?? null,
    input.sessionIdentifier ?? null,
    input.evidenceFileId ?? null,
    input.evidenceSource,
    fingerprint,
    nowIso(),
  );
  return db.prepare('SELECT * FROM charging_evidence WHERE id = ?').get(id);
}

export function reviewEvidence(db, actor, { type, id, decision, notes }) {
  requireAdmin(actor);
  if (![EVIDENCE_DECISIONS.accepted, EVIDENCE_DECISIONS.denied].includes(decision)) {
    throw new PilotError('INVALID_DECISION', 'decision must be accepted or denied', 400);
  }
  return withImmediateTransaction(db, () => {
    const table = type === 'commute' ? 'commute_evidence' : 'charging_evidence';
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) throw new PilotError('NOT_FOUND', 'evidence not found', 404);
    if (row.tenant_id !== actor.tenant_id) throw new PilotError('FORBIDDEN', 'cross-tenant access denied', 403);
    db.prepare(`UPDATE ${table} SET decision = ?, reviewer_id = ?, reviewed_at = ?, review_notes = ? WHERE id = ?`)
      .run(decision, actor.id, nowIso(), notes || '', id);
    audit(db, {
      tenantId: actor.tenant_id,
      actorId: actor.id,
      action: `${type}.review`,
      entityType: table,
      entityId: id,
      payload: { decision, notes: notes || '' },
      correlationId: newCorrelationId(),
    });
    const updated = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    let award = null;
    if (decision === EVIDENCE_DECISIONS.accepted && type === 'charging') {
      award = evaluateAwardUnsafe(db, actor, updated.id);
    } else if (decision === EVIDENCE_DECISIONS.accepted && type === 'commute') {
      const charging = db.prepare(`SELECT * FROM charging_evidence WHERE participant_id = ? AND charging_date = ? AND decision = ?`)
        .get(row.participant_id, row.commute_date, EVIDENCE_DECISIONS.accepted);
      if (charging) award = evaluateAwardUnsafe(db, actor, charging.id);
    }
    return { evidence: updated, award };
  });
}

function monthlyAwardStats(db, participantId, month) {
  const row = db.prepare(`SELECT COUNT(*) AS awards, COALESCE(SUM(credits), 0) AS credits FROM awards WHERE participant_id = ? AND local_month = ? AND status = 'awarded'`)
    .get(participantId, month);
  return { awards: Number(row.awards), credits: Number(row.credits) };
}

export function evaluateAward(db, actor, chargingEvidenceId) {
  return withImmediateTransaction(db, () => evaluateAwardUnsafe(db, actor, chargingEvidenceId));
}

function evaluateAwardUnsafe(db, actor, chargingEvidenceId) {
  requireAdmin(actor);
  const charging = db.prepare('SELECT * FROM charging_evidence WHERE id = ?').get(chargingEvidenceId);
  if (!charging) throw new PilotError('NOT_FOUND', 'charging evidence not found', 404);
  const existing = db.prepare(`SELECT * FROM awards WHERE charging_evidence_id = ? AND status = 'awarded'`).get(charging.id);
  if (existing) return existing;

  const participant = db.prepare('SELECT * FROM users WHERE id = ?').get(charging.participant_id);
  const reasons = qualifyingFailures(db, participant, charging);
  if (reasons.length) return { awarded: false, reasons };

  const commute = db.prepare(`SELECT * FROM commute_evidence WHERE participant_id = ? AND commute_date = ? AND decision = ?`)
    .get(participant.id, charging.charging_date, EVIDENCE_DECISIONS.accepted);
  const correlationId = newCorrelationId();
  const awardId = newId('awd');
  try {
    db.prepare(`INSERT INTO awards (id, tenant_id, participant_id, local_date, local_month, commute_evidence_id, charging_evidence_id, credits, status, correlation_id, created_at, actor_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'awarded', ?, ?, ?)`).run(
      awardId,
      participant.tenant_id,
      participant.id,
      charging.charging_date,
      charging.charging_date.slice(0, 7),
      commute.id,
      charging.id,
      AWARD_CREDITS,
      correlationId,
      nowIso(),
      actor.id,
    );
  } catch (error) {
    const raced = db.prepare(`SELECT * FROM awards WHERE charging_evidence_id = ? AND status = 'awarded'`).get(charging.id)
      || db.prepare(`SELECT * FROM awards WHERE participant_id = ? AND local_date = ? AND status = 'awarded'`).get(participant.id, charging.charging_date);
    if (raced) return raced;
    throw error;
  }
  insertCredit(db, {
    tenant_id: participant.tenant_id,
    participant_id: participant.id,
    entry_type: CREDIT_LEDGER_TYPES.earned,
    amount_credits: AWARD_CREDITS,
    award_id: awardId,
    actor_id: actor.id,
    correlation_id: correlationId,
    note: 'Qualifying Clean Commute and Charging Day',
  });
  audit(db, {
    tenantId: participant.tenant_id,
    actorId: actor.id,
    action: 'award.issue',
    entityType: 'awards',
    entityId: awardId,
    payload: { credits: AWARD_CREDITS, localDate: charging.charging_date },
    correlationId,
  });
  const awarded = db.prepare('SELECT * FROM awards WHERE id = ?').get(awardId);
  recordOutboundAward(db, awarded);
  return awarded;
}

export function qualifyingFailures(db, participant, charging) {
  const reasons = [];
  try { assertPilotActive(db, new Date(charging.start_at)); } catch (error) { reasons.push(error.code); }
  if (!participant?.enrolled_in_pasadena_pilot) reasons.push('NOT_ENROLLED');
  if (!participant?.vehicle_eligible_bev) reasons.push('VEHICLE_INELIGIBLE');
  const hub = db.prepare('SELECT * FROM charging_hubs WHERE id = ?').get(charging.hub_id);
  if (hub?.activation_status !== HUB_ACTIVATION_STATUSES.active) reasons.push('HUB_INACTIVE');
  if (charging.decision !== EVIDENCE_DECISIONS.accepted) reasons.push('CHARGING_EVIDENCE_NOT_ACCEPTED');
  if (charging.energy_wh < MIN_ENERGY_WH) reasons.push('ENERGY_BELOW_MINIMUM');
  if (isPeakStart(charging.start_at)) reasons.push('PEAK_WINDOW');
  const commute = db.prepare(`SELECT * FROM commute_evidence WHERE participant_id = ? AND commute_date = ? AND decision = ?`)
    .get(participant.id, charging.charging_date, EVIDENCE_DECISIONS.accepted);
  if (!commute) reasons.push('COMMUTE_EVIDENCE_REQUIRED');
  const monthStats = monthlyAwardStats(db, participant.id, charging.charging_date.slice(0, 7));
  if (monthStats.awards >= MAX_AWARDS_PER_MONTH || monthStats.credits >= MAX_CREDITS_PER_MONTH) reasons.push('MONTHLY_LIMIT');
  const dayAward = db.prepare(`SELECT id FROM awards WHERE participant_id = ? AND local_date = ? AND status = 'awarded'`).get(participant.id, charging.charging_date);
  if (dayAward) reasons.push('DAILY_LIMIT');
  return reasons;
}

export function requestRedemption(db, actor, { credits, deliveryMethod, hubId, idempotencyKey }) {
  requireParticipant(actor);
  assertPilotActive(db);
  const option = redemptionOption(credits);
  if (!option) throw new PilotError('INVALID_REDEMPTION', 'only 500-credit ($5) and 1000-credit ($10) redemptions are allowed', 400);
  if (!Object.values(DELIVERY_METHODS).includes(deliveryMethod)) {
    throw new PilotError('INVALID_DELIVERY', 'delivery method must be voucher or receipt', 400);
  }
  return withImmediateTransaction(db, () => {
    if (idempotencyKey) {
      const prior = db.prepare('SELECT * FROM idempotency_keys WHERE key = ? AND user_id = ?').get(idempotencyKey, actor.id);
      if (prior) return JSON.parse(prior.response_body);
    }
    const available = creditBalance(db, actor.id);
    if (available < option.credits) throw new PilotError('INSUFFICIENT_CREDITS', 'credits cannot create a negative balance', 409);
    const correlationId = newCorrelationId();
    const id = newId('rdm');
    db.prepare(`INSERT INTO redemptions (id, tenant_id, participant_id, credits, benefit_cents, delivery_method, status, hub_id, correlation_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      actor.tenant_id,
      actor.id,
      option.credits,
      option.benefitCents,
      deliveryMethod,
      REDEMPTION_STATUSES.requested,
      hubId ?? null,
      correlationId,
      nowIso(),
      nowIso(),
    );
    insertCredit(db, {
      tenant_id: actor.tenant_id,
      participant_id: actor.id,
      entry_type: CREDIT_LEDGER_TYPES.reserved,
      amount_credits: option.credits,
      redemption_id: id,
      actor_id: actor.id,
      correlation_id: correlationId,
      note: 'redemption requested',
    });
    db.prepare(`INSERT INTO redemption_status_history (redemption_id, from_status, to_status, actor_id, reason, correlation_id, created_at)
      VALUES (?, NULL, ?, ?, '', ?, ?)`).run(id, REDEMPTION_STATUSES.requested, actor.id, correlationId, nowIso());
    const created = serializeRedemption(db, id);
    if (idempotencyKey) {
      db.prepare(`INSERT INTO idempotency_keys (key, user_id, request_hash, response_status, response_body, created_at)
        VALUES (?, ?, ?, 201, ?, ?)`).run(idempotencyKey, actor.id, String(credits), JSON.stringify(created), nowIso());
    }
    return created;
  });
}

function serializeRedemption(db, id) {
  const redemption = db.prepare('SELECT * FROM redemptions WHERE id = ?').get(id);
  return {
    ...redemption,
    history: db.prepare('SELECT * FROM redemption_status_history WHERE redemption_id = ? ORDER BY id').all(id),
    delivery: db.prepare('SELECT * FROM deliveries WHERE redemption_id = ?').get(id) || null,
  };
}

function applyCreditRelease(db, redemption, actor, correlationId, note) {
  insertCredit(db, {
    tenant_id: redemption.tenant_id,
    participant_id: redemption.participant_id,
    entry_type: CREDIT_LEDGER_TYPES.released,
    amount_credits: redemption.credits,
    redemption_id: redemption.id,
    actor_id: actor.id,
    correlation_id: correlationId,
    note,
  });
}

function applyCreditRedeemed(db, redemption, actor, correlationId) {
  applyCreditRelease(db, redemption, actor, correlationId, 'reserved credits converted at settlement');
  insertCredit(db, {
    tenant_id: redemption.tenant_id,
    participant_id: redemption.participant_id,
    entry_type: CREDIT_LEDGER_TYPES.redeemed,
    amount_credits: redemption.credits,
    redemption_id: redemption.id,
    actor_id: actor.id,
    correlation_id: correlationId,
    note: 'benefit settled',
  });
}

function applyBudgetReserve(db, redemption, actor, correlationId) {
  const snapshot = budgetSnapshot(db, redemption.tenant_id);
  if (snapshot.available < redemption.benefit_cents) {
    throw new PilotError('BUDGET_EXCEEDED', 'sponsor-funded obligations cannot exceed the $500 pilot budget', 409);
  }
  insertBudget(db, {
    tenant_id: redemption.tenant_id,
    entry_type: BUDGET_LEDGER_TYPES.reserved,
    amount_cents: redemption.benefit_cents,
    redemption_id: redemption.id,
    actor_id: actor.id,
    correlation_id: correlationId,
    note: 'redemption approved',
  });
}

function moveBudget(db, redemption, actor, correlationId, fromType, toType) {
  const entries = budgetEntriesForRedemption(db, redemption.id);
  const fromNet = netBudgetBucket(entries, fromType) - netBudgetBucket(entries, fromType === BUDGET_LEDGER_TYPES.reserved ? BUDGET_LEDGER_TYPES.released : 'noop');
  // Simpler explicit conversions:
  if (fromType === BUDGET_LEDGER_TYPES.reserved && toType === BUDGET_LEDGER_TYPES.issued) {
    insertBudget(db, { tenant_id: redemption.tenant_id, entry_type: BUDGET_LEDGER_TYPES.released, amount_cents: redemption.benefit_cents, redemption_id: redemption.id, actor_id: actor.id, correlation_id: correlationId, note: 'release reservation into issued' });
    insertBudget(db, { tenant_id: redemption.tenant_id, entry_type: BUDGET_LEDGER_TYPES.issued, amount_cents: redemption.benefit_cents, redemption_id: redemption.id, actor_id: actor.id, correlation_id: correlationId, note: 'benefit issued' });
    return;
  }
  if (fromType === BUDGET_LEDGER_TYPES.issued && toType === BUDGET_LEDGER_TYPES.settled) {
    insertBudget(db, { tenant_id: redemption.tenant_id, entry_type: BUDGET_LEDGER_TYPES.released, amount_cents: redemption.benefit_cents, redemption_id: redemption.id, actor_id: actor.id, correlation_id: correlationId, note: 'release issued into settled' });
    insertBudget(db, { tenant_id: redemption.tenant_id, entry_type: BUDGET_LEDGER_TYPES.settled, amount_cents: redemption.benefit_cents, redemption_id: redemption.id, actor_id: actor.id, correlation_id: correlationId, note: 'benefit settled' });
    return;
  }
  if (fromType === BUDGET_LEDGER_TYPES.reserved && toType === BUDGET_LEDGER_TYPES.released) {
    insertBudget(db, { tenant_id: redemption.tenant_id, entry_type: BUDGET_LEDGER_TYPES.released, amount_cents: redemption.benefit_cents, redemption_id: redemption.id, actor_id: actor.id, correlation_id: correlationId, note: 'reservation released' });
    return;
  }
  if (fromType === BUDGET_LEDGER_TYPES.settled && toType === BUDGET_LEDGER_TYPES.reversed) {
    insertBudget(db, { tenant_id: redemption.tenant_id, entry_type: BUDGET_LEDGER_TYPES.reversed, amount_cents: redemption.benefit_cents, redemption_id: redemption.id, actor_id: actor.id, correlation_id: correlationId, note: 'settlement reversed' });
    return;
  }
  if (fromType === BUDGET_LEDGER_TYPES.issued && toType === BUDGET_LEDGER_TYPES.released) {
    insertBudget(db, { tenant_id: redemption.tenant_id, entry_type: BUDGET_LEDGER_TYPES.released, amount_cents: redemption.benefit_cents, redemption_id: redemption.id, actor_id: actor.id, correlation_id: correlationId, note: 'issued amount released' });
    return;
  }
  void fromNet;
}

export function transitionRedemption(db, actor, { redemptionId, action, reason, delivery, correlationId: incomingCorrelation }) {
  if (action === PARTICIPANT_REDEMPTION_ACTIONS.confirm_receipt) {
    return confirmReceipt(db, actor, redemptionId);
  }
  const toStatus = ACTION_TO_STATUS[action];
  if (!toStatus) throw new PilotError('UNKNOWN_ACTION', 'unknown redemption action', 400);
  requireAdmin(actor);
  return withImmediateTransaction(db, () => {
    const redemption = db.prepare('SELECT * FROM redemptions WHERE id = ?').get(redemptionId);
    if (!redemption) throw new PilotError('NOT_FOUND', 'redemption not found', 404);
    if (redemption.tenant_id !== actor.tenant_id) throw new PilotError('FORBIDDEN', 'cross-tenant access denied', 403);
    if (redemption.status === toStatus) return serializeRedemption(db, redemptionId);
    if (!canTransition(redemption.status, toStatus)) {
      throw new PilotError('ILLEGAL_TRANSITION', `cannot transition from ${redemption.status} to ${toStatus}`, 409);
    }
    const correlationId = incomingCorrelation || newCorrelationId();
    applyStatusSideEffects(db, actor, redemption, toStatus, { reason, delivery, correlationId });
    db.prepare('UPDATE redemptions SET status = ?, updated_at = ? WHERE id = ?').run(toStatus, nowIso(), redemptionId);
    db.prepare(`INSERT INTO redemption_status_history (redemption_id, from_status, to_status, actor_id, reason, correlation_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(redemptionId, redemption.status, toStatus, actor.id, reason || '', correlationId, nowIso());
    audit(db, {
      tenantId: redemption.tenant_id,
      actorId: actor.id,
      action: `redemption.${action}`,
      entityType: 'redemptions',
      entityId: redemptionId,
      payload: { from: redemption.status, to: toStatus, reason: reason || '' },
      correlationId,
    });
    return serializeRedemption(db, redemptionId);
  });
}

function applyStatusSideEffects(db, actor, redemption, toStatus, { reason, delivery, correlationId }) {
  if (toStatus === REDEMPTION_STATUSES.approved) {
    applyBudgetReserve(db, redemption, actor, correlationId);
  }
  if (toStatus === REDEMPTION_STATUSES.denied || toStatus === REDEMPTION_STATUSES.expired_unused) {
    applyCreditRelease(db, redemption, actor, correlationId, reason || toStatus);
    if (redemption.status === REDEMPTION_STATUSES.approved) {
      moveBudget(db, redemption, actor, correlationId, BUDGET_LEDGER_TYPES.reserved, BUDGET_LEDGER_TYPES.released);
    }
  }
  if (toStatus === REDEMPTION_STATUSES.delivery_failed) {
    if ([REDEMPTION_STATUSES.approved, REDEMPTION_STATUSES.benefit_issued].includes(redemption.status)) {
      const from = redemption.status === REDEMPTION_STATUSES.benefit_issued ? BUDGET_LEDGER_TYPES.issued : BUDGET_LEDGER_TYPES.reserved;
      moveBudget(db, redemption, actor, correlationId, from, BUDGET_LEDGER_TYPES.released);
    }
    applyCreditRelease(db, redemption, actor, correlationId, 'delivery_failed');
  }
  if (toStatus === REDEMPTION_STATUSES.benefit_issued) {
    recordDelivery(db, actor, redemption, delivery, correlationId);
    if (redemption.status === REDEMPTION_STATUSES.approved) {
      moveBudget(db, redemption, actor, correlationId, BUDGET_LEDGER_TYPES.reserved, BUDGET_LEDGER_TYPES.issued);
    }
  }
  if (toStatus === REDEMPTION_STATUSES.settled) {
    if (redemption.status === REDEMPTION_STATUSES.benefit_issued) {
      moveBudget(db, redemption, actor, correlationId, BUDGET_LEDGER_TYPES.issued, BUDGET_LEDGER_TYPES.settled);
    } else if (redemption.status === REDEMPTION_STATUSES.session_verification_pending) {
      const entries = budgetEntriesForRedemption(db, redemption.id);
      const issued = netBudgetBucket(entries, BUDGET_LEDGER_TYPES.issued);
      if (issued === 0 && netBudgetBucket(entries, BUDGET_LEDGER_TYPES.reserved) > 0) {
        moveBudget(db, redemption, actor, correlationId, BUDGET_LEDGER_TYPES.reserved, BUDGET_LEDGER_TYPES.issued);
      }
      moveBudget(db, redemption, actor, correlationId, BUDGET_LEDGER_TYPES.issued, BUDGET_LEDGER_TYPES.settled);
    }
    applyCreditRedeemed(db, redemption, actor, correlationId);
  }
  if (toStatus === REDEMPTION_STATUSES.reversed) {
    insertCredit(db, {
      tenant_id: redemption.tenant_id,
      participant_id: redemption.participant_id,
      entry_type: CREDIT_LEDGER_TYPES.reversed,
      amount_credits: redemption.credits,
      redemption_id: redemption.id,
      actor_id: actor.id,
      correlation_id: correlationId,
      note: reason || 'reversed',
    });
    moveBudget(db, redemption, actor, correlationId, BUDGET_LEDGER_TYPES.settled, BUDGET_LEDGER_TYPES.reversed);
  }
}

function recordDelivery(db, actor, redemption, delivery = {}, correlationId) {
  const existing = db.prepare('SELECT id FROM deliveries WHERE redemption_id = ?').get(redemption.id);
  if (existing) return;
  if (redemption.delivery_method === DELIVERY_METHODS.voucher) {
    if (!delivery.voucherProvider || !delivery.voucherIdentifier || !delivery.faceValueCents || !delivery.issueDate || !delivery.expirationDate) {
      throw new PilotError('DELIVERY_FIELDS', 'voucher delivery requires provider, identifier, face value, issue date, and expiration date', 400);
    }
    if (Number(delivery.faceValueCents) !== redemption.benefit_cents) {
      throw new PilotError('DELIVERY_VALUE', 'voucher face value must equal the approved benefit cents', 400);
    }
    if (delivery.voucherCode) {
      console.info('voucher issued', { redemptionId: redemption.id, identifier: delivery.voucherIdentifier });
    }
    db.prepare(`INSERT INTO deliveries (
      id, redemption_id, method, voucher_provider, voucher_identifier, voucher_code_fingerprint, face_value_cents,
      issue_date, expiration_date, delivery_confirmed_at, created_at, actor_id
    ) VALUES (?, ?, 'voucher', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newId('dlv'),
      redemption.id,
      delivery.voucherProvider,
      delivery.voucherIdentifier,
      delivery.voucherCode ? hashSecret(delivery.voucherCode) : null,
      delivery.faceValueCents,
      delivery.issueDate,
      delivery.expirationDate,
      delivery.deliveryConfirmedAt || nowIso(),
      nowIso(),
      actor.id,
    );
  } else {
    if (!delivery.approvedAmountCents || !delivery.deliveryReference || !delivery.issueDate) {
      throw new PilotError('DELIVERY_FIELDS', 'receipt delivery requires approved amount, delivery reference, and issue date', 400);
    }
    if (Number(delivery.approvedAmountCents) !== redemption.benefit_cents) {
      throw new PilotError('DELIVERY_VALUE', 'approved receipt amount must equal the benefit cents', 400);
    }
    db.prepare(`INSERT INTO deliveries (
      id, redemption_id, method, approved_amount_cents, delivery_reference, issue_date, receipt_confirmation,
      charging_evidence_id, created_at, actor_id
    ) VALUES (?, ?, 'receipt', ?, ?, ?, ?, ?, ?, ?)`).run(
      newId('dlv'),
      redemption.id,
      delivery.approvedAmountCents,
      delivery.deliveryReference,
      delivery.issueDate,
      delivery.receiptConfirmation || '',
      delivery.chargingEvidenceId ?? null,
      nowIso(),
      actor.id,
    );
  }
  void correlationId;
}

export function confirmReceipt(db, actor, redemptionId) {
  requireParticipant(actor);
  return withImmediateTransaction(db, () => {
    const redemption = db.prepare('SELECT * FROM redemptions WHERE id = ?').get(redemptionId);
    if (!redemption || redemption.participant_id !== actor.id) throw new PilotError('NOT_FOUND', 'redemption not found', 404);
    if (redemption.status !== REDEMPTION_STATUSES.benefit_issued) {
      throw new PilotError('ILLEGAL_TRANSITION', 'receipt confirmation is only valid after benefit issuance', 409);
    }
    const delivery = db.prepare('SELECT * FROM deliveries WHERE redemption_id = ?').get(redemptionId);
    if (!delivery) throw new PilotError('DELIVERY_MISSING', 'delivery record required', 409);
    db.prepare('UPDATE deliveries SET participant_receipt_confirmed_at = ? WHERE id = ?').run(nowIso(), delivery.id);
    const correlationId = newCorrelationId();
    moveBudget(db, redemption, actor, correlationId, BUDGET_LEDGER_TYPES.issued, BUDGET_LEDGER_TYPES.settled);
    applyCreditRedeemed(db, redemption, actor, correlationId);
    db.prepare('UPDATE redemptions SET status = ?, updated_at = ? WHERE id = ?').run(REDEMPTION_STATUSES.settled, nowIso(), redemptionId);
    db.prepare(`INSERT INTO redemption_status_history (redemption_id, from_status, to_status, actor_id, reason, correlation_id, created_at)
      VALUES (?, ?, ?, ?, 'participant confirmed receipt', ?, ?)`).run(redemptionId, redemption.status, REDEMPTION_STATUSES.settled, actor.id, correlationId, nowIso());
    return serializeRedemption(db, redemptionId);
  });
}

export function participantDashboard(db, actor) {
  requireParticipant(actor);
  const available = creditBalance(db, actor.id);
  const month = localMonth(new Date());
  const monthStats = monthlyAwardStats(db, actor.id, month);
  const redemptions = db.prepare('SELECT * FROM redemptions WHERE participant_id = ? ORDER BY created_at DESC').all(actor.id)
    .map((row) => serializeRedemption(db, row.id));
  const commute = db.prepare('SELECT * FROM commute_evidence WHERE participant_id = ? ORDER BY submitted_at DESC').all(actor.id);
  const charging = db.prepare('SELECT * FROM charging_evidence WHERE participant_id = ? ORDER BY submitted_at DESC').all(actor.id);
  return {
    participant: publicUser(actor),
    availableCredits: available,
    conversion: conversionCopy(),
    redemptionOptions: [
      { credits: 500, benefitCents: 500, label: '$5 benefit' },
      { credits: 1000, benefitCents: 1000, label: '$10 benefit' },
    ],
    progress: progressToNextRedemption(available),
    monthlyLimit: {
      awardsUsed: monthStats.awards,
      awardsMax: MAX_AWARDS_PER_MONTH,
      creditsUsed: monthStats.credits,
      creditsMax: MAX_CREDITS_PER_MONTH,
      timezone: TIMEZONE,
    },
    promotionalNotice: 'Green Route Credits are promotional accounting units for this research-stage pilot. They are not cash, wages, cryptocurrency, stored value, or transferable property.',
    redemptions,
    commuteEvidence: commute,
    chargingEvidence: charging,
    hubs: listHubs(db).map((hub) => ({
      id: hub.id,
      name: hub.name,
      addressLine: hub.address_line,
      city: hub.city,
      state: hub.state,
      activationStatus: hub.activation_status,
      verificationStatus: hub.verification_status,
      partnershipDisclaimer: hub.partnershipDisclaimer,
    })),
    ledger: db.prepare('SELECT id, entry_type, amount_credits, created_at, note FROM credit_ledger WHERE participant_id = ? ORDER BY id').all(actor.id),
  };
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.display_name,
    tenantId: user.tenant_id,
    enrolled: Boolean(user.enrolled_in_pasadena_pilot),
    vehicleEligibleBev: Boolean(user.vehicle_eligible_bev),
  };
}

export function adminDashboard(db, actor) {
  requireAdmin(actor);
  const tenantId = actor.tenant_id;
  const pendingCommute = db.prepare(`SELECT * FROM commute_evidence WHERE tenant_id = ? AND decision = 'pending' ORDER BY submitted_at`).all(tenantId);
  const pendingCharging = db.prepare(`SELECT * FROM charging_evidence WHERE tenant_id = ? AND decision = 'pending' ORDER BY submitted_at`).all(tenantId);
  const fingerprints = db.prepare('SELECT fingerprint, COUNT(*) AS n FROM charging_evidence WHERE tenant_id = ? GROUP BY fingerprint HAVING n > 1').all(tenantId);
  const queue = db.prepare(`SELECT * FROM redemptions WHERE tenant_id = ? AND status IN ('requested', 'under_review', 'approved', 'benefit_issued', 'session_verification_pending', 'verification_required', 'disputed', 'delivery_failed') ORDER BY created_at`).all(tenantId)
    .map((row) => serializeRedemption(db, row.id));
  return {
    pilot: getPilot(db),
    budget: budgetSnapshot(db, tenantId),
    conversion: conversionCopy(),
    pendingCommute,
    pendingCharging,
    duplicateFingerprints: fingerprints,
    redemptionQueue: queue,
    hubs: listHubs(db),
    audit: db.prepare('SELECT * FROM audit_events WHERE tenant_id = ? ORDER BY id DESC LIMIT 100').all(tenantId),
    users: db.prepare('SELECT id, email, role, display_name, tenant_id, enrolled_in_pasadena_pilot, vehicle_eligible_bev FROM users WHERE tenant_id = ? ORDER BY role, email').all(tenantId),
    companions: companionStatus(db),
  };
}

export function monthlyReport(db, actor, month) {
  requireAdmin(actor);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new PilotError('INVALID_MONTH', 'month must be YYYY-MM', 400);
  const tenantId = actor.tenant_id;
  const start = `${month}-01T00:00:00.000Z`;
  const [year, mon] = month.split('-').map(Number);
  const endMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`;
  const end = `${endMonth}-01T00:00:00.000Z`;
  const inMonth = (column) => `${column} >= ? AND ${column} < ?`;

  const redemptions = db.prepare('SELECT * FROM redemptions WHERE tenant_id = ?').all(tenantId);
  const monthRedemptions = redemptions.filter((row) => row.created_at >= start && row.created_at < end);
  const countValue = (status) => {
    const rows = monthRedemptions.filter((row) => row.status === status);
    return { count: rows.length, cents: rows.reduce((sum, row) => sum + row.benefit_cents, 0) };
  };
  const history = db.prepare('SELECT * FROM redemption_status_history WHERE created_at >= ? AND created_at < ?').all(start, end);
  const approved = history.filter((row) => row.to_status === REDEMPTION_STATUSES.approved);
  const issued = history.filter((row) => row.to_status === REDEMPTION_STATUSES.benefit_issued);
  const settled = history.filter((row) => row.to_status === REDEMPTION_STATUSES.settled);
  const redemptionById = Object.fromEntries(redemptions.map((row) => [row.id, row]));
  const sumHistory = (rows) => rows.reduce((sum, row) => sum + (redemptionById[row.redemption_id]?.benefit_cents || 0), 0);

  const fundedBefore = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS t FROM budget_ledger WHERE tenant_id = ? AND entry_type = 'funded' AND created_at < ?`).get(tenantId, start).t;
  const fundedMonth = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS t FROM budget_ledger WHERE tenant_id = ? AND entry_type = 'funded' AND ${inMonth('created_at')}`).get(tenantId, start, end).t;
  const snapshot = budgetSnapshot(db, tenantId);
  const creditsEarned = db.prepare(`SELECT COALESCE(SUM(amount_credits),0) AS t FROM credit_ledger WHERE tenant_id = ? AND entry_type = 'earned' AND ${inMonth('created_at')}`).get(tenantId, start, end).t;
  const creditsRedeemed = db.prepare(`SELECT COALESCE(SUM(amount_credits),0) AS t FROM credit_ledger WHERE tenant_id = ? AND entry_type = 'redeemed' AND ${inMonth('created_at')}`).get(tenantId, start, end).t;
  const activeParticipants = db.prepare(`SELECT COUNT(DISTINCT participant_id) AS t FROM awards WHERE tenant_id = ? AND status = 'awarded' AND ${inMonth('created_at')}`).get(tenantId, start, end).t;
  const sessions = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(energy_wh),0) AS wh FROM charging_evidence WHERE tenant_id = ? AND decision = 'accepted' AND ${inMonth('submitted_at')}`).get(tenantId, start, end);
  const byHub = db.prepare(`SELECT hub_id, COUNT(*) AS sessions, COALESCE(SUM(energy_wh),0) AS energy_wh FROM charging_evidence WHERE tenant_id = ? AND decision = 'accepted' AND ${inMonth('submitted_at')} GROUP BY hub_id`).all(tenantId, start, end);
  const exceptions = db.prepare(`SELECT * FROM redemptions WHERE tenant_id = ? AND status IN ('disputed', 'delivery_failed', 'verification_required')`).all(tenantId);

  const requested = { count: monthRedemptions.length, cents: monthRedemptions.reduce((sum, row) => sum + row.benefit_cents, 0) };

  const report = {
    reportingMonth: month,
    sponsor: SPONSOR_NAME,
    timezone: TIMEZONE,
    openingFundedBalanceCents: Number(fundedBefore),
    additionalFundingCents: Number(fundedMonth),
    requestedRedemptions: requested,
    approvedRedemptions: { count: approved.length, cents: sumHistory(approved) },
    benefitsIssued: { count: issued.length, cents: sumHistory(issued) },
    settled: { count: settled.length, cents: sumHistory(settled) },
    denied: countValue(REDEMPTION_STATUSES.denied),
    expiredUnused: countValue(REDEMPTION_STATUSES.expired_unused),
    deliveryFailed: countValue(REDEMPTION_STATUSES.delivery_failed),
    disputed: countValue(REDEMPTION_STATUSES.disputed),
    reversed: countValue(REDEMPTION_STATUSES.reversed),
    outstandingReservedCents: Number(db.prepare(`SELECT COALESCE(SUM(benefit_cents),0) AS t FROM redemptions WHERE tenant_id = ? AND status = 'approved'`).get(tenantId).t),
    closingAvailableBudgetCents: snapshot.available,
    creditsEarned: Number(creditsEarned),
    creditsRedeemed: Number(creditsRedeemed),
    activeParticipants: Number(activeParticipants),
    qualifyingChargingSessions: Number(sessions.n),
    energyDeliveredKwhNumeratorWh: Number(sessions.wh),
    energyDeliveredKwh: `${Math.trunc(Number(sessions.wh) / 1000)}.${String(Number(sessions.wh) % 1000).padStart(3, '0')}`,
    activityByChargingHub: byHub,
    exceptionsRequiringSponsorReview: exceptions.map((row) => ({ id: row.id, status: row.status, credits: row.credits })),
    ledgerControlTotal: snapshot.controlTotal,
    budgetSnapshot: snapshot,
    generatedAt: nowIso(),
    estimatesOrMissingData: exceptions.length ? 'Open exception statuses require sponsor review before treating settlement as final.' : 'None flagged.',
  };
  return report;
}

export function reportToCsv(report) {
  const lines = [
    ['field', 'value'],
    ['reporting_month', report.reportingMonth],
    ['sponsor', report.sponsor],
    ['opening_funded_balance_cents', report.openingFundedBalanceCents],
    ['additional_funding_cents', report.additionalFundingCents],
    ['requested_count', report.requestedRedemptions.count],
    ['requested_cents', report.requestedRedemptions.cents],
    ['approved_count', report.approvedRedemptions.count],
    ['approved_cents', report.approvedRedemptions.cents],
    ['issued_count', report.benefitsIssued.count],
    ['issued_cents', report.benefitsIssued.cents],
    ['settled_count', report.settled.count],
    ['settled_cents', report.settled.cents],
    ['denied_count', report.denied.count],
    ['denied_cents', report.denied.cents],
    ['expired_count', report.expiredUnused.count],
    ['failed_count', report.deliveryFailed.count],
    ['disputed_count', report.disputed.count],
    ['reversed_count', report.reversed.count],
    ['outstanding_reserved_cents', report.outstandingReservedCents],
    ['closing_available_budget_cents', report.closingAvailableBudgetCents],
    ['credits_earned', report.creditsEarned],
    ['credits_redeemed', report.creditsRedeemed],
    ['active_participants', report.activeParticipants],
    ['qualifying_charging_sessions', report.qualifyingChargingSessions],
    ['energy_delivered_kwh', report.energyDeliveredKwh],
    ['ledger_control_total', report.ledgerControlTotal],
    ['generated_at', report.generatedAt],
    ['notes', report.estimatesOrMissingData],
  ];
  for (const hub of report.activityByChargingHub) {
    lines.push([`hub_${hub.hub_id}_sessions`, hub.sessions]);
    lines.push([`hub_${hub.hub_id}_energy_wh`, hub.energy_wh]);
  }
  return lines.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
}

export function enrollParticipant(db, actor, userId) {
  requireAdmin(actor);
  db.prepare('UPDATE users SET enrolled_in_pasadena_pilot = 1 WHERE id = ? AND role = ?').run(userId, USER_ROLES.participant);
  return db.prepare('SELECT id, email, enrolled_in_pasadena_pilot FROM users WHERE id = ?').get(userId);
}

export { getPilot, CHECKLIST_ITEMS, SEED_HUBS, DEFAULT_PILOT_DAYS, FUNDED_CENTS };
