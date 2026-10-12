// The storage contract. Two implementations: SQLite (local dev, tests) and Firestore (hosted).
import type { Criterion, Verdict } from "../agent";

export type GigStatus = "draft" | "awaiting_funding" | "funded" | "verifying" | "verified" | "settling" | "settled" | "failed";
export type Role = "client" | "freelancer";
export type Clarification = { question: string; answer: string };
export type Settlement = { releasePercent: number; captureCents: number; payoutCents: number; feeCents: number; returnedCents: number };

export type Gig = {
  id: string;
  title: string;
  brief: string;
  criteria: Criterion[];
  clarifications: Clarification[];
  amountCents: number;
  currency: string;
  freelancerEmail: string;
  status: GigStatus;
  clientToken: string;
  freelancerToken: string;
  orderId: string | null;
  authorizationId: string | null;
  captureId: string | null;
  payoutBatchId: string | null;
  verdict: Verdict | null;
  settlement: Settlement | null;
  /** Change requests the client has made so far. */
  revisions: number;
  createdAt: string;
};

export type GigEvent = { id: number; actor: "client" | "freelancer" | "agent" | "paypal"; type: string; detail: string; at: string };

export type NewGig = Pick<Gig, "title" | "brief" | "criteria" | "clarifications" | "amountCents" | "currency" | "freelancerEmail">;

export type GigPatch = Partial<Pick<Gig, "status" | "orderId" | "authorizationId" | "captureId" | "payoutBatchId" | "verdict" | "criteria" | "clarifications" | "settlement" | "revisions">>;

export interface Store {
  createGig(input: NewGig): Promise<Gig>;
  getGig(id: string): Promise<Gig | null>;
  getGigByToken(token: string): Promise<{ gig: Gig; role: Role } | null>;
  updateGig(id: string, patch: GigPatch): Promise<void>;
  /** Atomically move a gig from one status to another; false if it wasn't in `from`, so two clicks can't both move money. */
  transition(id: string, from: GigStatus, to: GigStatus): Promise<boolean>;
  /** Returns the new event's id, increasing within a gig. */
  logEvent(gigId: string, actor: GigEvent["actor"], type: string, detail: string): Promise<number>;
  /**
   * Record a verification outcome only if `runId` (its work_submitted event id) is still the latest submission
   * and the gig is still verifying. A superseded or interrupted run changes nothing.
   */
  finishVerification(id: string, runId: number, verdict: Verdict): Promise<boolean>;
  failVerification(id: string, runId: number): Promise<boolean>;
  /** The activity log: everything except live progress lines. */
  listEvents(gigId: string): Promise<GigEvent[]>;
  /** Progress lines of the most recent verification run. */
  listProgress(gigId: string): Promise<string[]>;
  lastEventAt(gigId: string): Promise<string | null>;
}
