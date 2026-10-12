// Runs the storage contract against a real Firestore project when FIRESTORE_TEST_SERVICE_ACCOUNT is set
// (service-account JSON; FIRESTORE_DATABASE_ID picks a named database). Uses a throwaway collection prefix
// and deletes it afterwards.
import { getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { afterAll, describe, vi } from "vitest";
import { storeContract } from "./contract";
import { createFirestoreStore } from "./firestore";

const sa = process.env.FIRESTORE_TEST_SERVICE_ACCOUNT;
const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";

if (sa) {
  vi.setConfig({ testTimeout: 60_000 }); // real network round trips, several per test
  const prefix = `test_${Date.now()}_`;
  storeContract("Firestore", () => createFirestoreStore(JSON.parse(sa), prefix, databaseId));
  afterAll(async () => {
    const app = getApps().find((a) => a.name === "holdfast");
    if (!app) return;
    const db = getFirestore(app, databaseId);
    await db.recursiveDelete(db.collection(`${prefix}gigs`));
  }, 60_000);
} else {
  describe.skip("Firestore store (set FIRESTORE_TEST_SERVICE_ACCOUNT to run)", () => {});
}
