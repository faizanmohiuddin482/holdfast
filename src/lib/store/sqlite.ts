// SQLite storage (node:sqlite): local development and tests.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Gig, GigEvent, GigPatch, GigStatus, NewGig, Store } from "./types";

type Row = Record<string, string | number | null>;

const json = <T>(v: string | number | null, fallback: T): T => (typeof v === "string" && v ? (JSON.parse(v) as T) : fallback);

const toGig = (r: Row): Gig => ({
  id: r.id as string,
  title: r.title as string,
  brief: r.brief as string,
  criteria: json(r.criteria, []),
  clarifications: json(r.clarifications, []),
  amountCents: r.amount_cents as number,
  currency: r.currency as string,
  freelancerEmail: r.freelancer_email as string,
  status: r.status as GigStatus,
  clientToken: r.client_token as string,
  freelancerToken: r.freelancer_token as string,
  orderId: r.order_id as string | null,
  authorizationId: r.authorization_id as string | null,
  captureId: r.capture_id as string | null,
  payoutBatchId: r.payout_batch_id as string | null,
  verdict: json(r.verdict, null),
  settlement: json(r.settlement, null),
  revisions: (r.revisions as number | null) ?? 0,
  createdAt: r.created_at as string,
});

const columns: Record<keyof GigPatch, string> = {
  status: "status",
  orderId: "order_id",
  authorizationId: "authorization_id",
  captureId: "capture_id",
  payoutBatchId: "payout_batch_id",
  verdict: "verdict",
  criteria: "criteria",
  clarifications: "clarifications",
  settlement: "settlement",
  revisions: "revisions",
};
const jsonColumns = new Set(["verdict", "criteria", "clarifications", "settlement"]);

function open(file: string): DatabaseSync {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
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
  // Idempotent migrations for databases created before tokens, settlement amounts and revisions existed.
  const existing = new Set((db.prepare("PRAGMA table_info(gigs)").all() as { name: string }[]).map((c) => c.name));
  const added: [string, string][] = [
    ["client_token", "TEXT"],
    ["freelancer_token", "TEXT"],
    ["clarifications", "TEXT NOT NULL DEFAULT '[]'"],
    ["settlement", "TEXT"],
    ["revisions", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [name, type] of added) if (!existing.has(name)) db.exec(`ALTER TABLE gigs ADD COLUMN ${name} ${type}`);
  for (const { id } of db.prepare("SELECT id FROM gigs WHERE client_token IS NULL").all() as { id: string }[]) {
    db.prepare("UPDATE gigs SET client_token = ?, freelancer_token = ? WHERE id = ?").run(nanoid(24), nanoid(24), id);
  }
  db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS gigs_client_token ON gigs(client_token);
CREATE UNIQUE INDEX IF NOT EXISTS gigs_freelancer_token ON gigs(freelancer_token);
`);
  return db;
}

// A verification run is identified by its work_submitted event: only the latest run, while the gig is
// still verifying, may record its outcome.
const isCurrentRun = "status = 'verifying' AND (SELECT MAX(id) FROM events WHERE gig_id = gigs.id AND type = 'work_submitted') = ?";

export function createSqliteStore(file: string): Store {
  const db = open(file);
  const getGig = async (id: string) => {
    const row = db.prepare("SELECT * FROM gigs WHERE id = ?").get(id) as Row | undefined;
    return row ? toGig(row) : null;
  };

  return {
    async createGig(input: NewGig) {
      const id = nanoid(10);
      db.prepare(
        `INSERT INTO gigs (id, title, brief, criteria, clarifications, amount_cents, currency, freelancer_email, status, client_token, freelancer_token, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      ).run(
        id, input.title, input.brief, JSON.stringify(input.criteria), JSON.stringify(input.clarifications),
        input.amountCents, input.currency, input.freelancerEmail, nanoid(24), nanoid(24), new Date().toISOString(),
      );
      return (await getGig(id))!;
    },

    getGig,

    async getGigByToken(token) {
      if (!token) return null;
      const row = db.prepare("SELECT * FROM gigs WHERE client_token = ? OR freelancer_token = ?").get(token, token) as Row | undefined;
      if (!row) return null;
      return { gig: toGig(row), role: row.client_token === token ? "client" : "freelancer" };
    },

    async updateGig(id, patch) {
      const entries = Object.entries(patch) as [keyof GigPatch, unknown][];
      if (!entries.length) return;
      const sets = entries.map(([k]) => `${columns[k]} = ?`).join(", ");
      const values = entries.map(([k, v]) => (jsonColumns.has(k) && v != null ? JSON.stringify(v) : (v as string | number | null)));
      db.prepare(`UPDATE gigs SET ${sets} WHERE id = ?`).run(...values, id);
    },

    async transition(id, from, to) {
      return db.prepare("UPDATE gigs SET status = ? WHERE id = ? AND status = ?").run(to, id, from).changes === 1;
    },

    async logEvent(gigId, actor, type, detail) {
      const res = db.prepare("INSERT INTO events (gig_id, actor, type, detail, at) VALUES (?, ?, ?, ?, ?)").run(gigId, actor, type, detail, new Date().toISOString());
      return Number(res.lastInsertRowid);
    },

    async finishVerification(id, runId, verdict) {
      return db.prepare(`UPDATE gigs SET verdict = ?, status = 'verified' WHERE id = ? AND ${isCurrentRun}`).run(JSON.stringify(verdict), id, runId).changes === 1;
    },

    async failVerification(id, runId) {
      return db.prepare(`UPDATE gigs SET status = 'funded' WHERE id = ? AND ${isCurrentRun}`).run(id, runId).changes === 1;
    },

    async listEvents(gigId) {
      return db.prepare("SELECT id, actor, type, detail, at FROM events WHERE gig_id = ? AND type != 'progress' ORDER BY id").all(gigId) as GigEvent[];
    },

    async listProgress(gigId) {
      const rows = db.prepare(
        `SELECT detail FROM events WHERE gig_id = ? AND type = 'progress'
           AND id > COALESCE((SELECT MAX(id) FROM events WHERE gig_id = ? AND type = 'work_submitted'), 0)
         ORDER BY id`,
      ).all(gigId, gigId) as { detail: string }[];
      return rows.map((r) => r.detail);
    },

    async lastEventAt(gigId) {
      const row = db.prepare("SELECT MAX(at) AS at FROM events WHERE gig_id = ?").get(gigId) as { at: string | null };
      return row.at;
    },
  };
}
