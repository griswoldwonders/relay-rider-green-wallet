import { scryptHash } from './util.js';
import {
  CHECKLIST_ITEMS,
  DEFAULT_PILOT_DAYS,
  FUNDED_CENTS,
  SEED_HUBS,
  SPONSOR_NAME,
  TIMEZONE,
  USER_ROLES,
} from '../shared/contract.js';
import { nowIso, newId } from './util.js';

export const DEMO_PASSWORD = process.env.PILOT_DEMO_PASSWORD || 'pilot-research-beta';

export const DEMO_USERS = [
  {
    id: 'user-admin-01',
    email: 'admin@commonpathways.example',
    role: USER_ROLES.administrator,
    displayName: 'Pilot Administrator',
    tenantId: 'pasadena-pilot',
    enrolled: 0,
    vehicleEligible: 0,
    vehicleId: null,
    vehicleRef: null,
  },
  {
    id: 'user-participant-a',
    email: 'rider.a@example.test',
    role: USER_ROLES.participant,
    displayName: 'Pasadena Rider A',
    tenantId: 'pasadena-pilot',
    enrolled: 1,
    vehicleEligible: 1,
    vehicleId: 'veh-a-bev',
    vehicleRef: 'CA-PILOT-A',
  },
  {
    id: 'user-participant-b',
    email: 'rider.b@example.test',
    role: USER_ROLES.participant,
    displayName: 'Pasadena Rider B',
    tenantId: 'pasadena-pilot',
    enrolled: 1,
    vehicleEligible: 1,
    vehicleId: 'veh-b-bev',
    vehicleRef: 'CA-PILOT-B',
  },
  {
    id: 'user-outsider',
    email: 'outsider@other-tenant.example',
    role: USER_ROLES.participant,
    displayName: 'Other Tenant Rider',
    tenantId: 'other-tenant',
    enrolled: 0,
    vehicleEligible: 1,
    vehicleId: 'veh-other',
    vehicleRef: 'XX-OTHER',
  },
];

export function seedDatabase(db, { password = DEMO_PASSWORD } = {}) {
  const hash = scryptHash(password);
  const created = nowIso();
  const insertUser = db.prepare(`INSERT OR IGNORE INTO users (
    id, email, password_hash, role, display_name, tenant_id, enrolled_in_pasadena_pilot,
    vehicle_id, vehicle_eligible_bev, vehicle_registration_ref, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const user of DEMO_USERS) {
    insertUser.run(
      user.id,
      user.email,
      hash,
      user.role,
      user.displayName,
      user.tenantId,
      user.enrolled,
      user.vehicleId,
      user.vehicleEligible,
      user.vehicleRef,
      created,
    );
  }

  db.prepare(`INSERT OR IGNORE INTO pilot_config (
    id, sponsor_name, timezone, funded_cents, duration_days, effective_at, activated_at, activated_by, enabled, updated_at
  ) VALUES (1, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?)`).run(SPONSOR_NAME, TIMEZONE, FUNDED_CENTS, DEFAULT_PILOT_DAYS, created);

  const funded = db.prepare(`SELECT id FROM budget_ledger WHERE entry_type = 'funded' LIMIT 1`).get();
  if (!funded) {
    db.prepare(`INSERT INTO budget_ledger (tenant_id, entry_type, amount_cents, redemption_id, actor_id, correlation_id, note, created_at)
      VALUES ('pasadena-pilot', 'funded', ?, NULL, 'user-admin-01', ?, 'Initial authorized pilot budget $500', ?)`).run(
      FUNDED_CENTS,
      crypto.randomUUID(),
      created,
    );
  }

  const insertHub = db.prepare(`INSERT OR IGNORE INTO charging_hubs (
    id, name, address_line, city, state, verification_status, activation_status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertItem = db.prepare(`INSERT OR IGNORE INTO hub_checklist_items (
    id, hub_id, item_key, label, required, completed, completed_by, completed_at
  ) VALUES (?, ?, ?, ?, 1, 0, NULL, NULL)`);
  for (const hub of SEED_HUBS) {
    insertHub.run(hub.id, hub.name, hub.addressLine, hub.city, hub.state, hub.verificationStatus, hub.activationStatus, created);
    for (const item of CHECKLIST_ITEMS) {
      insertItem.run(newId('chk'), hub.id, item.key, item.label);
    }
  }

  const identities = [
    ['cid-a', 'user-participant-a', 'rr-participant-a'],
    ['cid-b', 'user-participant-b', 'rr-participant-b'],
  ];
  const insertIdentity = db.prepare(`INSERT OR IGNORE INTO companion_identities (
    id, tenant_id, user_id, relay_rider_profile_id, relay_rider_external_id, aqmd_participant_key, created_at
  ) VALUES (?, 'pasadena-pilot', ?, NULL, ?, ?, ?)`);
  for (const [id, userId, externalId] of identities) {
    insertIdentity.run(id, userId, externalId, externalId, created);
  }
}
