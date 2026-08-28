import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL DEFAULT '',
          password_hash TEXT,
          google_sub TEXT UNIQUE,
          plan TEXT NOT NULL DEFAULT 'free',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scans (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          domain TEXT NOT NULL,
          source_url TEXT NOT NULL,
          scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (user_id, email, source_url)
        );

        CREATE TABLE IF NOT EXISTS oauth_states (
          state TEXT PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS scans_user_scanned_idx ON scans (user_id, scanned_at DESC);
        CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
      `);
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}
