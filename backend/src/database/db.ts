import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

const DB_PATH = process.env.DB_PATH || './data/stackpulse.db';
const dbDir = path.dirname(path.resolve(DB_PATH));

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db: Database.Database = new Database(path.resolve(DB_PATH));

// Performance settings
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -32000'); // 32 MB cache

export default db;

export function runMigrations(): void {
  logger.info('Running database migrations...');

  const schemaPath = path.resolve(__dirname, '../../src/database/schema.sql');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));

  const ensureColumn = (table: string, column: string, definition: string): void => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((entry) => entry.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  ensureColumn('endpoints', 'owner_id', 'TEXT REFERENCES users(id) ON DELETE SET NULL');
  ensureColumn('endpoints', 'gatus_key', 'TEXT');
  ensureColumn('endpoints', 'expected_status', 'INTEGER NOT NULL DEFAULT 200');
  ensureColumn('endpoints', 'expected_content', 'TEXT');
  ensureColumn('endpoints', 'public_slug', 'TEXT');
  ensureColumn('endpoints', 'paused_at', 'TEXT');
  ensureColumn('endpoints', 'deleted_at', 'TEXT');
  ensureColumn('incidents', 'endpoint_id', 'TEXT REFERENCES endpoints(id) ON DELETE SET NULL');
  ensureColumn('incidents', 'owner_id', 'TEXT REFERENCES users(id) ON DELETE SET NULL');
  ensureColumn('incidents', 'dedupe_key', 'TEXT');
  ensureColumn('incidents', 'failure_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('health_checks', 'failure_detail', 'TEXT');
  ensureColumn('failure_verifications', 'reference_configured', 'INTEGER NOT NULL DEFAULT 0');

  const unsupportedIntervals = (db.prepare(
    'SELECT COUNT(*) AS count FROM endpoints WHERE interval_seconds NOT IN (30, 60, 120)'
  ).get() as { count: number }).count;
  if (unsupportedIntervals > 0) {
    db.exec(`
      UPDATE endpoints SET interval_seconds = CASE
        WHEN ABS(interval_seconds - 30) <= ABS(interval_seconds - 60)
          AND ABS(interval_seconds - 30) <= ABS(interval_seconds - 120) THEN 30
        WHEN ABS(interval_seconds - 60) <= ABS(interval_seconds - 120) THEN 60
        ELSE 120
      END
      WHERE interval_seconds NOT IN (30, 60, 120)
    `);
    logger.warn('Legacy endpoint intervals normalized to the nearest supported interval', {
      count: unsupportedIntervals,
    });
  }

  db.prepare(
    `UPDATE endpoints SET gatus_key = 'stackpulse_' || replace(id, '-', '_')
     WHERE gatus_key IS NULL OR gatus_key = ''`
  ).run();

  db.exec(`
    INSERT INTO endpoint_schedule_history (id, endpoint_id, interval_seconds, starts_at, created_at)
    SELECT 'legacy:' || id, id, interval_seconds, created_at, created_at
    FROM endpoints e
    WHERE enabled = 1 AND deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM endpoint_schedule_history s WHERE s.endpoint_id = e.id
      );

    INSERT INTO health_checks
      (id, endpoint_id, schedule_id, scheduled_check_id, engine_result_id, http_status,
       latency_ms, checked_at, success, failure_classification, tls_expires_at, source, created_at)
    SELECT c.id, c.endpoint_id, NULL, 'legacy:' || c.id, NULL, c.status_code,
           c.latency_ms, c.checked_at, c.success,
           CASE WHEN c.success = 1 THEN NULL
                WHEN c.status_code IS NOT NULL THEN 'http_status'
                ELSE 'connection' END,
           NULL, 'native', c.checked_at
    FROM check_results c
    WHERE NOT EXISTS (SELECT 1 FROM health_checks h WHERE h.id = c.id)
      AND NOT EXISTS (SELECT 1 FROM health_checks h WHERE h.scheduled_check_id = 'legacy:' || c.id);
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_endpoints_gatus_key ON endpoints(gatus_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_endpoints_public_slug ON endpoints(public_slug);
    CREATE INDEX IF NOT EXISTS idx_endpoints_owner_enabled ON endpoints(owner_id, enabled);
    CREATE INDEX IF NOT EXISTS idx_incidents_owner_status ON incidents(owner_id, status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_one_active_endpoint
      ON incidents(endpoint_id) WHERE endpoint_id IS NOT NULL AND status != 'resolved';
  `);

  logger.info('Database migrations complete.');
}

