// Runs the storage contract against a real Firestore project when FIRESTORE_TEST_SERVICE_ACCOUNT is set
// (service-account JSON). Uses a throwaway collection prefix and deletes it afterwards.
import { getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { afterAll, describe } from "vitest";
import { storeContract } from "./contract";
import { createFirestoreStore } from "./firestore";

const sa = process.env.FIRESTORE_TEST_SERVICE_ACCOUNT;

if (sa) {
  const prefix = `test_${Date.now()}_`;
  storeContract("Firestore", () => createFirestoreStore(JSON.parse(sa), prefix));
  afterAll(async () => {
    const app = getApps().find((a) => a.name === "holdfast");
    if (app) await getFirestore(app).recursiveDelete(getFirestore(app).collection(`${prefix}gigs`));
  }, 60_000);
} else {
  describe.skip("Firestore store (set FIRESTORE_TEST_SERVICE_ACCOUNT to run)", () => {});
}
