CREATE TABLE companion_identities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  relay_rider_profile_id TEXT,
  relay_rider_external_id TEXT,
  aqmd_participant_key TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX companion_identities_rr_external
  ON companion_identities(tenant_id, relay_rider_external_id)
  WHERE relay_rider_external_id IS NOT NULL;

CREATE UNIQUE INDEX companion_identities_aqmd_key
  ON companion_identities(tenant_id, aqmd_participant_key)
  WHERE aqmd_participant_key IS NOT NULL;

CREATE TABLE commute_companion_links (
  commute_evidence_id TEXT PRIMARY KEY REFERENCES commute_evidence(id),
  source_system TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  source_sha256 TEXT,
  participant_external_id TEXT,
  institution_id TEXT,
  feed_contract TEXT,
  vehicle_fuel_type TEXT,
  date_provenance TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_system, source_record_id)
);

CREATE TABLE companion_sync_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  companion TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
