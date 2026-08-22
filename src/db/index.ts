import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const isLocal =
  databaseUrl.includes("localhost") ||
  databaseUrl.includes("127.0.0.1") ||
  databaseUrl.includes("::1");

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaDbInitPromise?: Promise<void>;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

export async function initDbTables(): Promise<void> {
  if (globalForDb.__arenaDbInitPromise) {
    return globalForDb.__arenaDbInitPromise;
  }
  globalForDb.__arenaDbInitPromise = (async () => {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS bot_state (
          id SERIAL PRIMARY KEY,
          is_running BOOLEAN NOT NULL DEFAULT false,
          kill_switch BOOLEAN NOT NULL DEFAULT false,
          heartbeat_mins INTEGER NOT NULL DEFAULT 30,
          equity DOUBLE PRECISION NOT NULL DEFAULT 100000,
          initial_capital DOUBLE PRECISION NOT NULL DEFAULT 100000,
          peak_equity DOUBLE PRECISION NOT NULL DEFAULT 100000,
          loss_streak INTEGER NOT NULL DEFAULT 0,
          last_exit_time BIGINT,
          last_exit_dir INTEGER NOT NULL DEFAULT 0,
          last_exit_was_tp BOOLEAN NOT NULL DEFAULT false,
          last_processed_time BIGINT,
          pos_dir INTEGER NOT NULL DEFAULT 0,
          pos_qty DOUBLE PRECISION NOT NULL DEFAULT 0,
          pos_entry_price DOUBLE PRECISION,
          pos_entry_time BIGINT,
          pos_atr DOUBLE PRECISION,
          pos_stop_price DOUBLE PRECISION,
          pos_target_price DOUBLE PRECISION,
          pos_brk_level DOUBLE PRECISION,
          pos_regime TEXT,
          pos_entry_commission DOUBLE PRECISION,
          updated_at BIGINT NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS trades (
          id SERIAL PRIMARY KEY,
          side TEXT NOT NULL,
          regime TEXT NOT NULL,
          qty DOUBLE PRECISION NOT NULL,
          entry_price DOUBLE PRECISION NOT NULL,
          exit_price DOUBLE PRECISION NOT NULL,
          entry_time BIGINT NOT NULL,
          exit_time BIGINT NOT NULL,
          pnl DOUBLE PRECISION NOT NULL,
          commission DOUBLE PRECISION NOT NULL,
          r_multiple DOUBLE PRECISION,
          reason TEXT NOT NULL,
          atr_ratio DOUBLE PRECISION,
          eff_risk DOUBLE PRECISION,
          origin TEXT NOT NULL DEFAULT 'LIVE'
        );

        CREATE TABLE IF NOT EXISTS equity_snapshots (
          id SERIAL PRIMARY KEY,
          time BIGINT NOT NULL UNIQUE,
          equity DOUBLE PRECISION NOT NULL,
          pos_dir INTEGER NOT NULL DEFAULT 0
        );

        -- Forward migration for databases created by earlier deploys.
        ALTER TABLE bot_state
          ADD COLUMN IF NOT EXISTS heartbeat_mins INTEGER NOT NULL DEFAULT 30;
      `);
    } catch (err) {
      console.error("Auto table initialization error:", err);
    } finally {
      client.release();
    }
  })();
  return globalForDb.__arenaDbInitPromise;
}
