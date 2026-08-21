import { pgTable, serial, text, doublePrecision, integer, boolean, bigint } from "drizzle-orm/pg-core";

/**
 * Singleton row (id = 1) holding the entire mutable paper-bot state.
 * Mirrors the Pine `var` state of the v3.3c strategy: equity, peak equity,
 * loss streak, last-exit bookkeeping (for continuation re-entries) and the
 * currently open position with its active TP/SL parameters.
 */
export const botState = pgTable("bot_state", {
  id: serial("id").primaryKey(),

  isRunning: boolean("is_running").notNull().default(false),
  killSwitch: boolean("kill_switch").notNull().default(false),

  equity: doublePrecision("equity").notNull().default(100000),
  initialCapital: doublePrecision("initial_capital").notNull().default(100000),
  peakEquity: doublePrecision("peak_equity").notNull().default(100000),
  lossStreak: integer("loss_streak").notNull().default(0),

  /** Last closed trade bookkeeping (drives continuation re-entry) */
  lastExitTime: bigint("last_exit_time", { mode: "number" }),
  lastExitDir: integer("last_exit_dir").notNull().default(0),
  lastExitWasTP: boolean("last_exit_was_tp").notNull().default(false),

  /** Candle (open time, ms) of the last bar the engine has evaluated */
  lastProcessedTime: bigint("last_processed_time", { mode: "number" }),

  /** Open position (dir 0 = flat, 1 = long, -1 = short) */
  posDir: integer("pos_dir").notNull().default(0),
  posQty: doublePrecision("pos_qty").notNull().default(0),
  posEntryPrice: doublePrecision("pos_entry_price"),
  posEntryTime: bigint("pos_entry_time", { mode: "number" }),
  posATR: doublePrecision("pos_atr"),
  posStopPrice: doublePrecision("pos_stop_price"),
  posTargetPrice: doublePrecision("pos_target_price"),
  posBrkLevel: doublePrecision("pos_brk_level"),
  posRegime: text("pos_regime"),
  posEntryCommission: doublePrecision("pos_entry_commission"),

  updatedAt: bigint("updated_at", { mode: "number" }).notNull().default(0),
});

/**
 * Closed paper trades ledger.
 */
export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  side: text("side").notNull(), // LONG | SHORT
  regime: text("regime").notNull(), // STRONG | MEDIUM | QUIET | CONTINUATION
  qty: doublePrecision("qty").notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  exitPrice: doublePrecision("exit_price").notNull(),
  entryTime: bigint("entry_time", { mode: "number" }).notNull(), // candle open time (ms)
  exitTime: bigint("exit_time", { mode: "number" }).notNull(),
  pnl: doublePrecision("pnl").notNull(), // net of commission
  commission: doublePrecision("commission").notNull(),
  rMultiple: doublePrecision("r_multiple"),
  reason: text("reason").notNull(), // TP | SL | FAIL | REVERSE | KILL
  atrRatio: doublePrecision("atr_ratio"),
  effRisk: doublePrecision("eff_risk"),
  origin: text("origin").notNull().default("LIVE"), // LIVE | REPLAY
});

/**
 * Equity curve sampled after every processed 2H candle (mark-to-market).
 */
export const equitySnapshots = pgTable("equity_snapshots", {
  id: serial("id").primaryKey(),
  time: bigint("time", { mode: "number" }).notNull().unique(),
  equity: doublePrecision("equity").notNull(),
  posDir: integer("pos_dir").notNull().default(0),
});
