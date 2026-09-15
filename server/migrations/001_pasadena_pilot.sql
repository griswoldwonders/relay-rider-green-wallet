PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('participant', 'administrator')),
  display_name TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  enrolled_in_pasadena_pilot INTEGER NOT NULL DEFAULT 0 CHECK (enrolled_in_pasadena_pilot IN (0, 1)),
  vehicle_id TEXT,
  vehicle_eligible_bev INTEGER NOT NULL DEFAULT 0 CHECK (vehicle_eligible_bev IN (0, 1)),
  vehicle_registration_ref TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE pilot_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sponsor_name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  funded_cents INTEGER NOT NULL CHECK (funded_cents >= 0),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  effective_at TEXT,
  activated_at TEXT,
  activated_by TEXT REFERENCES users(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE charging_hubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address_line TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('location_verified', 'unverified')),
  activation_status TEXT NOT NULL CHECK (activation_status IN ('pending', 'active', 'inactive')),
  activated_at TEXT,
  activated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE hub_checklist_items (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL REFERENCES charging_hubs(id),
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  completed_by TEXT REFERENCES users(id),
  completed_at TEXT,
  UNIQUE (hub_id, item_key)
);

CREATE TABLE commute_evidence (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  participant_id TEXT NOT NULL REFERENCES users(id),
  commute_date TEXT NOT NULL,
  origin_zone TEXT NOT NULL,
  destination TEXT NOT NULL,
  travel_mode TEXT NOT NULL,
  vehicle_id TEXT,
  attestation INTEGER NOT NULL CHECK (attestation IN (0, 1)),
  submitted_at TEXT NOT NULL,
  reviewer_id TEXT REFERENCES users(id),
  reviewed_at TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('pending', 'accepted', 'denied')),
  review_notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE charging_evidence (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  participant_id TEXT NOT NULL REFERENCES users(id),
  hub_id TEXT NOT NULL REFERENCES charging_hubs(id),
  charging_date TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT,
  energy_wh INTEGER NOT NULL CHECK (energy_wh >= 0),
  amount_charged_cents INTEGER CHECK (amount_charged_cents IS NULL OR amount_charged_cents >= 0),
  session_identifier TEXT,
  evidence_file_id TEXT,
  evidence_source TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  submitted_at TEXT NOT NULL,
  reviewer_id TEXT REFERENCES users(id),
  reviewed_at TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('pending', 'accepted', 'denied')),
  review_notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE evidence_files (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_participant_id TEXT NOT NULL REFERENCES users(id),
  stored_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE awards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  participant_id TEXT NOT NULL REFERENCES users(id),
  local_date TEXT NOT NULL,
  local_month TEXT NOT NULL,
  commute_evidence_id TEXT NOT NULL REFERENCES commute_evidence(id),
  charging_evidence_id TEXT NOT NULL REFERENCES charging_evidence(id),
  credits INTEGER NOT NULL CHECK (credits = 100),
  status TEXT NOT NULL CHECK (status IN ('awarded', 'reversed')),
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id)
);

CREATE UNIQUE INDEX awards_one_per_day ON awards(participant_id, local_date) WHERE status = 'awarded';
CREATE UNIQUE INDEX awards_charging_unique ON awards(charging_evidence_id) WHERE status = 'awarded';
CREATE UNIQUE INDEX awards_commute_unique ON awards(commute_evidence_id) WHERE status = 'awarded';

CREATE TABLE credit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  participant_id TEXT NOT NULL REFERENCES users(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('earned', 'reserved', 'released', 'redeemed', 'reversed', 'expired')),
  amount_credits INTEGER NOT NULL CHECK (amount_credits > 0),
  award_id TEXT REFERENCES awards(id),
  redemption_id TEXT,
  actor_id TEXT REFERENCES users(id),
  correlation_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE redemptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  participant_id TEXT NOT NULL REFERENCES users(id),
  credits INTEGER NOT NULL CHECK (credits IN (500, 1000)),
  benefit_cents INTEGER NOT NULL CHECK (benefit_cents IN (500, 1000)),
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('voucher', 'receipt')),
  status TEXT NOT NULL CHECK (status IN (
    'requested', 'under_review', 'approved', 'benefit_issued', 'session_verification_pending',
    'settled', 'denied', 'expired_unused', 'delivery_failed', 'verification_required', 'disputed', 'reversed'
  )),
  hub_id TEXT REFERENCES charging_hubs(id),
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE redemption_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  redemption_id TEXT NOT NULL REFERENCES redemptions(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL DEFAULT '',
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  redemption_id TEXT NOT NULL UNIQUE REFERENCES redemptions(id),
  method TEXT NOT NULL CHECK (method IN ('voucher', 'receipt')),
  voucher_provider TEXT,
  voucher_identifier TEXT,
  voucher_code_fingerprint TEXT,
  face_value_cents INTEGER,
  issue_date TEXT,
  expiration_date TEXT,
  delivery_confirmed_at TEXT,
  participant_receipt_confirmed_at TEXT,
  approved_amount_cents INTEGER,
  delivery_reference TEXT,
  receipt_confirmation TEXT,
  charging_evidence_id TEXT REFERENCES charging_evidence(id),
  created_at TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE budget_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('funded', 'reserved', 'issued', 'settled', 'released', 'reversed')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  redemption_id TEXT REFERENCES redemptions(id),
  actor_id TEXT REFERENCES users(id),
  correlation_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE idempotency_keys (
  key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (key, user_id)
);
