import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Criterion, Verdict } from "./agent";

const file = process.env.HOLDFAST_DB ?? path.join(process.cwd(), "data", "holdfast.db");
if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });

const g = globalThis as unknown as { __holdfastDb?: DatabaseSync };
const db = (g.__holdfastDb ??= new DatabaseSync(file));

db.exec(`
CREATE TABLE IF NOT EXISTS gigs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  criteria TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  freelancer_email TEXT NOT NULL,
  status TEXT NOT NULL,
  order_id TEXT,
  authorization_id TEXT,
  capture_id TEXT,
  payout_batch_id TEXT,
  verdict TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gig_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  detail TEXT NOT NULL,
  at TEXT NOT NULL
);
`);

export type GigStatus =
  | "awaiting_funding"
  | "funded"
  | "verifying"
  | "verified"
  | "settling"
  | "settled"
  | "failed";

export type Gig = {
  id: string;
  title: string;
  brief: string;
  criteria: Criterion[];
  amountCents: number;
  currency: string;
  freelancerEmail: string;
  status: GigStatus;
  orderId: string | null;
  authorizationId: string | null;
  captureId: string | null;
  payoutBatchId: string | null;
  verdict: Verdict | null;
  createdAt: string;
};

export type GigEvent = { id: number; actor: "client" | "freelancer" | "agent" | "paypal"; type: string; detail: string; at: string };

type Row = Record<string, string | number | null>;

const toGig = (r: Row): Gig => ({
  id: r.id as string,
  title: r.title as string,
  brief: r.brief as string,
  criteria: JSON.parse(r.criteria as string),
  amountCents: r.amount_cents as number,
  currency: r.currency as string,
  freelancerEmail: r.freelancer_email as string,
  status: r.status as GigStatus,
  orderId: r.order_id as string | null,
  authorizationId: r.authorization_id as string | null,
  captureId: r.capture_id as string | null,
  payoutBatchId: r.payout_batch_id as string | null,
  verdict: r.verdict ? JSON.parse(r.verdict as string) : null,
  createdAt: r.created_at as string,
});

export function createGig(input: Pick<Gig, "title" | "brief" | "criteria" | "amountCents" | "currency" | "freelancerEmail">): Gig {
  const id = nanoid(10);
  db.prepare(
    `INSERT INTO gigs (id, title, brief, criteria, amount_cents, currency, freelancer_email, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_funding', ?)`,
  ).run(id, input.title, input.brief, JSON.stringify(input.criteria), input.amountCents, input.currency, input.freelancerEmail, new Date().toISOString());
  return getGig(id)!;
}

export function getGig(id: string): Gig | null {
  const row = db.prepare("SELECT * FROM gigs WHERE id = ?").get(id) as Row | undefined;
  return row ? toGig(row) : null;
}

export function listGigs(): Gig[] {
  return (db.prepare("SELECT * FROM gigs ORDER BY created_at DESC").all() as Row[]).map(toGig);
}

const columns: Record<string, string> = {
  status: "status",
  orderId: "order_id",
  authorizationId: "authorization_id",
  captureId: "capture_id",
  payoutBatchId: "payout_batch_id",
  verdict: "verdict",
};

export function updateGig(id: string, patch: Partial<Pick<Gig, "status" | "orderId" | "authorizationId" | "captureId" | "payoutBatchId" | "verdict">>) {
  const entries = Object.entries(patch);
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${columns[k]} = ?`).join(", ");
  const values = entries.map(([k, v]) => (k === "verdict" && v ? JSON.stringify(v) : (v as string | null)));
  db.prepare(`UPDATE gigs SET ${sets} WHERE id = ?`).run(...values, id);
}

/**
 * Atomically move a gig from one status to another. Returns false if it wasn't in `from`,
 * so two concurrent settle clicks can't both move money.
 */
export function transition(id: string, from: GigStatus, to: GigStatus): boolean {
  return db.prepare("UPDATE gigs SET status = ? WHERE id = ? AND status = ?").run(to, id, from).changes === 1;
}

export function logEvent(gigId: string, actor: GigEvent["actor"], type: string, detail: string) {
  db.prepare("INSERT INTO events (gig_id, actor, type, detail, at) VALUES (?, ?, ?, ?, ?)").run(gigId, actor, type, detail, new Date().toISOString());
}

export function listEvents(gigId: string): GigEvent[] {
  return db.prepare("SELECT id, actor, type, detail, at FROM events WHERE gig_id = ? ORDER BY id").all(gigId) as GigEvent[];
}
