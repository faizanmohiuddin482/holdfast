// The app's data access. Picks the storage backend once per process:
// Firestore when FIREBASE_SERVICE_ACCOUNT is set (hosted), otherwise a local SQLite file.
// Firestore is imported lazily so local runs never load Firebase.
import path from "node:path";
import { createSqliteStore } from "./store/sqlite";
import type { Store } from "./store/types";

export type { Clarification, Gig, GigEvent, GigPatch, GigStatus, NewGig, Role, Settlement, Store } from "./store/types";

async function pick(): Promise<Store> {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) {
    const { createFirestoreStore } = await import("./store/firestore");
    const env = process.env;
    return createFirestoreStore(JSON.parse(sa), env.FIRESTORE_COLLECTION_PREFIX ?? "", env.FIRESTORE_DATABASE_ID || "(default)");
  }
  return createSqliteStore(process.env.HOLDFAST_DB ?? path.join(process.cwd(), "data", "holdfast.db"));
}

const g = globalThis as unknown as { __holdfastStore?: Promise<Store> };
const store = (): Promise<Store> => (g.__holdfastStore ??= pick());

export const createGig: Store["createGig"] = async (input) => (await store()).createGig(input);
export const getGig: Store["getGig"] = async (id) => (await store()).getGig(id);
export const getGigByToken: Store["getGigByToken"] = async (token) => (await store()).getGigByToken(token);
export const updateGig: Store["updateGig"] = async (id, patch) => (await store()).updateGig(id, patch);
export const transition: Store["transition"] = async (id, from, to) => (await store()).transition(id, from, to);
export const logEvent: Store["logEvent"] = async (gigId, actor, type, detail) => (await store()).logEvent(gigId, actor, type, detail);
export const finishVerification: Store["finishVerification"] = async (id, runId, verdict) => (await store()).finishVerification(id, runId, verdict);
export const failVerification: Store["failVerification"] = async (id, runId) => (await store()).failVerification(id, runId);
export const listEvents: Store["listEvents"] = async (gigId) => (await store()).listEvents(gigId);
export const listProgress: Store["listProgress"] = async (gigId) => (await store()).listProgress(gigId);
export const lastEventAt: Store["lastEventAt"] = async (gigId) => (await store()).lastEventAt(gigId);
