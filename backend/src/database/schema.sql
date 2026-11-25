CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS endpoints (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  group_name TEXT NOT NULL DEFAULT 'default',
  url TEXT NOT NULL,
  expected_status INTEGER NOT NULL DEFAULT 200 CHECK (expected_status BETWEEN 100 AND 599),
  expected_content TEXT,
  gatus_key TEXT NOT NULL UNIQUE,
  public_slug TEXT UNIQUE,
  interval_seconds INTEGER NOT NULL CHECK (interval_seconds IN (30, 60, 120)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paused_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS endpoint_schedule_history (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  interval_seconds INTEGER NOT NULL CHECK (interval_seconds IN (30, 60, 120)),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS health_checks (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  schedule_id TEXT REFERENCES endpoint_schedule_history(id) ON DELETE SET NULL,
  scheduled_check_id TEXT NOT NULL UNIQUE,
  engine_result_id TEXT,
  http_status INTEGER,
  latency_ms REAL,
  checked_at TEXT NOT NULL,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  failure_classification TEXT,
  failure_detail TEXT,
  tls_expires_at TEXT,
  source TEXT NOT NULL CHECK (source IN ('native', 'gatus')),
  created_at TEXT NOT NULL,
  UNIQUE (endpoint_id, engine_result_id)
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT REFERENCES endpoints(id) ON DELETE SET NULL,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('open', 'investigating', 'resolved')),
  dedupe_key TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS incident_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'failure', 'recovered', 'updated')),
  message TEXT NOT NULL,
  health_check_id TEXT REFERENCES health_checks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  incident_id TEXT REFERENCES incidents(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'webhook')),
  event_type TEXT NOT NULL CHECK (event_type IN ('incident_created', 'incident_recovered')),
  dedupe_key TEXT NOT NULL UNIQUE,
  recipient TEXT NOT NULL,
  payload TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'simulated' CHECK (delivery_status IN ('simulated', 'sent', 'failed')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitoring_engine_health (
  id TEXT PRIMARY KEY,
  engine TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('available', 'unavailable', 'disabled', 'degraded')),
  version TEXT,
  image_digest TEXT,
  last_checked_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitoring_interruptions (
  id TEXT PRIMARY KEY,
  engine TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  reason TEXT NOT NULL,
  excluded_from_expected INTEGER NOT NULL DEFAULT 0 CHECK (excluded_from_expected IN (0, 1))
);

CREATE TABLE IF NOT EXISTS failure_verifications (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  health_check_id TEXT REFERENCES health_checks(id) ON DELETE SET NULL,
  target_success INTEGER NOT NULL CHECK (target_success IN (0, 1)),
  target_status INTEGER,
  target_failure_classification TEXT,
  reference_configured INTEGER NOT NULL DEFAULT 0 CHECK (reference_configured IN (0, 1)),
  reference_success INTEGER CHECK (reference_success IN (0, 1)),
  reference_failure_classification TEXT,
  outcome TEXT NOT NULL CHECK (
    outcome IN ('verified_endpoint_failure', 'possible_monitoring_network_failure', 'not_reproduced', 'unverified', 'not_needed')
  ),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_endpoint_start ON endpoint_schedule_history(endpoint_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_health_endpoint_checked ON health_checks(endpoint_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_schedule ON health_checks(schedule_id, scheduled_check_id);
CREATE INDEX IF NOT EXISTS idx_incident_events_incident_created ON incident_events(incident_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_owner_created ON notifications(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interruptions_engine_started ON monitoring_interruptions(engine, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_interruptions_one_open_per_engine
  ON monitoring_interruptions(engine) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_failure_verifications_endpoint_created
  ON failure_verifications(endpoint_id, created_at DESC);

CREATE TABLE IF NOT EXISTS incident_endpoints (
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  PRIMARY KEY (incident_id, endpoint_id)
);

CREATE TABLE IF NOT EXISTS tls_results (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  valid INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  issuer TEXT,
  common_name TEXT,
  days_until_expiry INTEGER,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uptime_cache (
  endpoint_id TEXT PRIMARY KEY REFERENCES endpoints(id) ON DELETE CASCADE,
  uptime_1h REAL DEFAULT 0,
  uptime_24h REAL DEFAULT 0,
  uptime_7d REAL DEFAULT 0,
  uptime_30d REAL DEFAULT 0,
  uptime_90d REAL DEFAULT 0,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS check_results (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  success INTEGER NOT NULL,
  status_code INTEGER,
  latency_ms INTEGER,
  error TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tls_results_endpoint_id ON tls_results(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_check_results_endpoint_checked ON check_results(endpoint_id, checked_at);
