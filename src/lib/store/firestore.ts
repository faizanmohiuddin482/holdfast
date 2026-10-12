// Firestore storage: the hosted deployment (Firebase free tier).
// Layout: {prefix}gigs/{gigId} holds the gig plus two counters; {prefix}gigs/{gigId}/events/{seq} holds its events.
//   eventSeq       — number of the gig's last event (event ids increase per gig)
//   lastSubmission — seq of the latest work_submitted event (identifies the current verification run)
// Only single-field queries are used, so Firestore's automatic indexes are enough.
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";
import { nanoid } from "nanoid";
import type { Gig, GigEvent, GigStatus, Store } from "./types";

/** Firestore rejects `undefined`; a JSON round trip drops it (all stored values are plain data). */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const pad = (seq: number) => String(seq).padStart(10, "0");

function toGig(id: string, d: DocumentData): Gig {
  return {
    id,
    title: d.title,
    brief: d.brief,
    criteria: d.criteria ?? [],
    clarifications: d.clarifications ?? [],
    amountCents: d.amountCents,
    currency: d.currency,
    freelancerEmail: d.freelancerEmail,
    status: d.status as GigStatus,
    clientToken: d.clientToken,
    freelancerToken: d.freelancerToken,
    orderId: d.orderId ?? null,
    authorizationId: d.authorizationId ?? null,
    captureId: d.captureId ?? null,
    payoutBatchId: d.payoutBatchId ?? null,
    verdict: d.verdict ?? null,
    settlement: d.settlement ?? null,
    revisions: d.revisions ?? 0,
    createdAt: d.createdAt,
  };
}

export function createFirestoreStore(serviceAccount: ServiceAccount, prefix = "", databaseId = "(default)"): Store {
  const app = getApps().find((a) => a.name === "holdfast") ?? initializeApp({ credential: cert(serviceAccount) }, "holdfast");
  const db = getFirestore(app, databaseId);
  const gigs = db.collection(`${prefix}gigs`);
  const eventsOf = (id: string) => gigs.doc(id).collection("events");

  const getGig = async (id: string) => {
    const snap = await gigs.doc(id).get();
    return snap.exists ? toGig(snap.id, snap.data()!) : null;
  };

  /** Run `change` on the gig inside a transaction if `when` holds; returns whether it ran. */
  const conditional = (id: string, when: (d: DocumentData) => boolean, change: (d: DocumentData) => DocumentData) =>
    db.runTransaction(async (tx) => {
      const ref = gigs.doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists || !when(snap.data()!)) return false;
      tx.update(ref, change(snap.data()!));
      return true;
    });

  return {
    async createGig(input) {
      const id = nanoid(10);
      const doc = {
        ...plain(input),
        status: "draft",
        clientToken: nanoid(24),
        freelancerToken: nanoid(24),
        orderId: null, authorizationId: null, captureId: null, payoutBatchId: null,
        verdict: null, settlement: null, revisions: 0,
        createdAt: new Date().toISOString(),
        eventSeq: 0,
        lastSubmission: 0,
      };
      await gigs.doc(id).create(doc);
      return toGig(id, doc);
    },

    getGig,

    async getGigByToken(token) {
      if (!token) return null;
      for (const [field, role] of [["clientToken", "client"], ["freelancerToken", "freelancer"]] as const) {
        const q = await gigs.where(field, "==", token).limit(1).get();
        if (!q.empty) return { gig: toGig(q.docs[0].id, q.docs[0].data()), role };
      }
      return null;
    },

    async updateGig(id, patch) {
      if (Object.keys(patch).length) await gigs.doc(id).update(plain(patch));
    },

    transition: (id, from, to) => conditional(id, (d) => d.status === from, () => ({ status: to })),

    logEvent: (gigId, actor, type, detail) =>
      db.runTransaction(async (tx) => {
        const ref = gigs.doc(gigId);
        const snap = await tx.get(ref);
        const seq = ((snap.data()?.eventSeq as number | undefined) ?? 0) + 1;
        tx.update(ref, type === "work_submitted" ? { eventSeq: seq, lastSubmission: seq } : { eventSeq: seq });
        tx.set(eventsOf(gigId).doc(pad(seq)), { seq, actor, type, detail, at: new Date().toISOString() });
        return seq;
      }),

    finishVerification: (id, runId, verdict) =>
      conditional(id, (d) => d.status === "verifying" && d.lastSubmission === runId, () => ({ status: "verified", verdict: plain(verdict) })),

    failVerification: (id, runId) =>
      conditional(id, (d) => d.status === "verifying" && d.lastSubmission === runId, () => ({ status: "funded" })),

    async listEvents(gigId) {
      const q = await eventsOf(gigId).orderBy("seq").get();
      return q.docs
        .map((d) => d.data())
        .filter((e) => e.type !== "progress")
        .map((e): GigEvent => ({ id: e.seq, actor: e.actor, type: e.type, detail: e.detail, at: e.at }));
    },

    async listProgress(gigId) {
      const gig = await gigs.doc(gigId).get();
      const after = (gig.data()?.lastSubmission as number | undefined) ?? 0;
      const q = await eventsOf(gigId).where("seq", ">", after).orderBy("seq").get();
      return q.docs.map((d) => d.data()).filter((e) => e.type === "progress").map((e) => e.detail as string);
    },

    async lastEventAt(gigId) {
      const q = await eventsOf(gigId).orderBy("seq", "desc").limit(1).get();
      return q.empty ? null : (q.docs[0].data().at as string);
    },
  };
}
