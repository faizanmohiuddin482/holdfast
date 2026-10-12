// One behavioural contract every storage backend must pass. Used by sqlite.test.ts and firestore.test.ts.
import { describe, expect, it } from "vitest";
import type { Verdict } from "../agent";
import type { NewGig, Store } from "./types";

const input: NewGig = {
  title: "Landing page",
  brief: "A landing page with three pricing tiers.",
  criteria: [{ id: "c1", text: "Has three tiers", weight: 3 }],
  clarifications: [{ question: "Monthly or yearly prices?", answer: "" }],
  amountCents: 2000,
  currency: "USD",
  freelancerEmail: "f@example.com",
};

const verdict = (summary: string): Verdict => ({
  results: [], confidence: "high", summary, messageToFreelancer: "", disputeDraft: "", manipulationAttempt: "",
  model: "m", at: "", sources: [], releasePercent: 100, releaseWorking: "",
});

export function storeContract(name: string, makeStore: () => Store) {
  describe(`${name} store`, () => {
    const store = makeStore();

    it("creates a draft gig with two distinct 24-char tokens", async () => {
      const gig = await store.createGig(input);
      expect(gig).toMatchObject({ status: "draft", revisions: 0, settlement: null, verdict: null, orderId: null, clarifications: input.clarifications });
      expect(gig.clientToken).toMatch(/^[\w-]{24}$/);
      expect(gig.freelancerToken).toMatch(/^[\w-]{24}$/);
      expect(gig.clientToken).not.toBe(gig.freelancerToken);
      expect(await store.getGig(gig.id)).toEqual(gig);
    });

    it("resolves each token to its role, and unknown tokens to null", async () => {
      const gig = await store.createGig(input);
      expect(await store.getGigByToken(gig.clientToken)).toMatchObject({ role: "client", gig: { id: gig.id } });
      expect(await store.getGigByToken(gig.freelancerToken)).toMatchObject({ role: "freelancer", gig: { id: gig.id } });
      expect(await store.getGigByToken("x".repeat(24))).toBeNull();
      expect(await store.getGigByToken("")).toBeNull();
      expect(await store.getGig("missing")).toBeNull();
    });

    it("round-trips every patchable field", async () => {
      const gig = await store.createGig(input);
      const settlement = { releasePercent: 60, captureCents: 1200, payoutCents: 1140, feeCents: 60, returnedCents: 800 };
      await store.updateGig(gig.id, {
        criteria: [{ id: "c1", text: "Changed", weight: 5 }], clarifications: [{ question: "Q", answer: "A" }], settlement,
        orderId: "O1", authorizationId: "A1", captureId: "C1", payoutBatchId: "B1", revisions: 2, verdict: verdict("v"),
      });
      expect(await store.getGig(gig.id)).toMatchObject({
        criteria: [{ id: "c1", text: "Changed", weight: 5 }], clarifications: [{ question: "Q", answer: "A" }], settlement,
        orderId: "O1", authorizationId: "A1", captureId: "C1", payoutBatchId: "B1", revisions: 2, verdict: { summary: "v" },
      });
    });

    it("transition only moves from the expected status, and only once when raced", async () => {
      const gig = await store.createGig(input);
      expect(await store.transition(gig.id, "funded", "verifying")).toBe(false);
      expect(await store.transition(gig.id, "draft", "awaiting_funding")).toBe(true);
      const raced = await Promise.all([1, 2, 3].map(() => store.transition(gig.id, "awaiting_funding", "funded")));
      expect(raced.filter(Boolean)).toHaveLength(1);
      expect((await store.getGig(gig.id))!.status).toBe("funded");
    });

    it("logs events in order, keeps progress out of the activity log, and returns only the latest run's progress", async () => {
      const gig = await store.createGig(input);
      const first = await store.logEvent(gig.id, "freelancer", "work_submitted", "first try");
      await store.logEvent(gig.id, "agent", "progress", "old line");
      const second = await store.logEvent(gig.id, "freelancer", "work_submitted", "second try");
      await store.logEvent(gig.id, "agent", "progress", "Opened https://x.dev");
      await store.logEvent(gig.id, "agent", "progress", "Judging 1 criteria");
      expect(second).toBeGreaterThan(first);
      expect(await store.listProgress(gig.id)).toEqual(["Opened https://x.dev", "Judging 1 criteria"]);
      const events = await store.listEvents(gig.id);
      expect(events.map((e) => [e.type, e.detail, e.actor])).toEqual([
        ["work_submitted", "first try", "freelancer"],
        ["work_submitted", "second try", "freelancer"],
      ]);
      expect(Date.parse((await store.lastEventAt(gig.id))!)).not.toBeNaN();
      expect(await store.lastEventAt("missing")).toBeNull();
    });

    it("records a verification outcome only for the current run while verifying", async () => {
      const gig = await store.createGig(input);
      await store.updateGig(gig.id, { status: "verifying" });
      const run1 = await store.logEvent(gig.id, "freelancer", "work_submitted", "one");
      const run2 = await store.logEvent(gig.id, "freelancer", "work_submitted", "two");
      expect(await store.finishVerification(gig.id, run1, verdict("stale"))).toBe(false);
      expect(await store.failVerification(gig.id, run1)).toBe(false);
      expect((await store.getGig(gig.id))!).toMatchObject({ status: "verifying", verdict: null });
      expect(await store.finishVerification(gig.id, run2, verdict("current"))).toBe(true);
      expect((await store.getGig(gig.id))!).toMatchObject({ status: "verified", verdict: { summary: "current" } });
      expect(await store.finishVerification(gig.id, run2, verdict("again"))).toBe(false);
    });

    it("fails the current run back to funded", async () => {
      const gig = await store.createGig(input);
      await store.updateGig(gig.id, { status: "verifying" });
      const run = await store.logEvent(gig.id, "freelancer", "work_submitted", "one");
      expect(await store.failVerification(gig.id, run)).toBe(true);
      expect((await store.getGig(gig.id))!.status).toBe("funded");
    });
  });
}
