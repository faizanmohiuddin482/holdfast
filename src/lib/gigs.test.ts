import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Judgement } from "./agent";

vi.mock("./agent", () => ({
  draftCriteria: vi.fn(async () => ({
    criteria: [
      { id: "c1", text: "Has a README", weight: 2 },
      { id: "c2", text: "Tests pass", weight: 2 },
    ],
    ambiguities: ["Which test framework?"],
  })),
  verifyDeliverable: vi.fn(),
}));
vi.mock("./paypal", () => ({
  createEscrowOrder: vi.fn(async () => "ORDER1"),
  authorizeOrder: vi.fn(async () => ({ authorizationId: "AUTH1", status: "CREATED", expiresAt: null })),
  captureAuthorization: vi.fn(async () => ({ captureId: "CAP1", status: "COMPLETED" })),
  voidAuthorization: vi.fn(async () => {}),
  payoutToFreelancer: vi.fn(async () => ({ batchId: "B1", status: "PENDING" })),
  getCaptureCents: vi.fn(),
}));

import { verifyDeliverable } from "./agent";
import { getGig, listEvents, listProgress } from "./db";
import * as gigs from "./gigs";
import * as paypal from "./paypal";

const judgement: Judgement = {
  results: [
    { criterionId: "c1", status: "met", evidence: "README.md present", sourceUrl: "https://github.com/a/b" },
    { criterionId: "c2", status: "partially_met", evidence: "tests exist, no CI run", sourceUrl: "https://github.com/a/b" },
  ],
  confidence: "high",
  summary: "Mostly done.",
  messageToFreelancer: "Add CI.",
  disputeDraft: "",
  manipulationAttempt: "",
  model: "test-model",
  at: "2026-10-09T00:00:00.000Z",
  sources: [{ url: "https://github.com/a/b", ok: true }],
};

const newGig = () => gigs.openGig({ title: "Lib", brief: "A library with tests.", amountCents: 2000, currency: "USD", freelancerEmail: "f@example.com" });

async function fundedGig() {
  const gig = await newGig();
  await gigs.confirmCriteria(gig.id);
  await gigs.startFunding(gig.id);
  await gigs.completeFunding(gig.id, "ORDER1");
  return gig;
}

beforeEach(() => {
  vi.mocked(verifyDeliverable).mockReset();
});

describe("draft", () => {
  it("opens as a draft with the AI's questions as unanswered clarifications", async () => {
    const gig = await newGig();
    expect(gig.status).toBe("draft");
    expect(gig.clarifications).toEqual([{ question: "Which test framework?", answer: "" }]);
  });

  it("saves edited criteria with renumbered ids and trimmed text", async () => {
    const gig = await newGig();
    await gigs.saveDraft(gig.id, { criteria: [{ text: "  Uses vitest ", weight: 3 }], clarifications: [{ question: "Which test framework?", answer: "vitest" }] });
    expect((await getGig(gig.id))!.criteria).toEqual([{ id: "c1", text: "Uses vitest", weight: 3 }]);
    expect((await getGig(gig.id))!.clarifications[0].answer).toBe("vitest");
  });

  it("rejects an empty criteria list or a blank criterion, and keeps the draft", async () => {
    const gig = await newGig();
    await expect(gigs.saveDraft(gig.id, { criteria: [], clarifications: [] })).rejects.toThrow("Add at least one criterion");
    await expect(gigs.saveDraft(gig.id, { criteria: [{ text: "   ", weight: 2 }], clarifications: [] })).rejects.toThrow("Every criterion needs some text");
    expect((await getGig(gig.id))!.criteria).toHaveLength(2);
    expect((await getGig(gig.id))!.status).toBe("draft");
  });

  it("locks criteria once confirmed", async () => {
    const gig = await newGig();
    await gigs.confirmCriteria(gig.id);
    expect((await getGig(gig.id))!.status).toBe("awaiting_funding");
    await expect(gigs.saveDraft(gig.id, { criteria: [{ text: "x", weight: 1 }], clarifications: [] })).rejects.toThrow("can't be edited");
  });
});

describe("verification", () => {
  it("returns as soon as verification starts, streams progress, then stores a computed release", async () => {
    let finish!: () => void;
    vi.mocked(verifyDeliverable).mockImplementation(async (_input, onProgress) => {
      onProgress?.("Opened https://github.com/a/b: 3 files");
      await new Promise<void>((r) => (finish = r));
      return judgement;
    });
    const gig = await fundedGig();
    await gigs.submitWork(gig.id, "Done: https://github.com/a/b");
    expect((await getGig(gig.id))!.status).toBe("verifying");
    expect((await listProgress(gig.id))).toEqual(["Opened https://github.com/a/b: 3 files"]);
    finish();
    await vi.waitFor(async () => expect((await getGig(gig.id))!.status).toBe("verified"));
    const v = (await getGig(gig.id))!.verdict!;
    expect(v.releasePercent).toBe(75);
    expect(v.releaseWorking).toBe("c1 2/2 · c2 1/2 → 3/4 = 75%");
  });

  it("goes back to funded with an event when verification fails", async () => {
    vi.mocked(verifyDeliverable).mockRejectedValue(new Error("The AI service is busy right now."));
    const gig = await fundedGig();
    await gigs.submitWork(gig.id, "Done");
    await vi.waitFor(async () => expect((await getGig(gig.id))!.status).toBe("funded"));
    expect((await listEvents(gig.id)).at(-1)).toMatchObject({ type: "verification_failed" });
  });

  it("recovers a gig stuck in verifying after 5 minutes", async () => {
    vi.mocked(verifyDeliverable).mockImplementation(() => new Promise(() => {}));
    const gig = await fundedGig();
    await gigs.submitWork(gig.id, "Done");
    const stuck = (await getGig(gig.id))!;
    expect((await gigs.recoverStale(stuck, Date.now() + 4 * 60_000)).status).toBe("verifying");
    expect((await gigs.recoverStale(stuck, Date.now() + 6 * 60_000)).status).toBe("funded");
    expect((await listEvents(gig.id)).at(-1)).toMatchObject({ type: "verification_interrupted" });
  });
});

describe("settle", () => {
  it("stores the settlement amounts of a partial release", async () => {
    vi.mocked(verifyDeliverable).mockResolvedValue(judgement);
    const gig = await fundedGig();
    await gigs.submitWork(gig.id, "Done");
    await vi.waitFor(async () => expect((await getGig(gig.id))!.status).toBe("verified"));
    await gigs.settle(gig.id, 60, "client");
    expect((await getGig(gig.id))!).toMatchObject({
      status: "settled",
      settlement: { releasePercent: 60, captureCents: 1200, feeCents: 60, payoutCents: 1140, returnedCents: 800 },
    });
    expect((await listEvents(gig.id)).some((e) => e.type === "override")).toBe(true);
  });
});

describe("lookup", () => {
  it("resolves tokens to roles", async () => {
    const gig = await newGig();
    expect((await gigs.lookup(gig.clientToken))?.role).toBe("client");
    expect((await gigs.lookup(gig.freelancerToken))?.role).toBe("freelancer");
    expect(await gigs.lookup("missing")).toBeNull();
  });
});

describe("a late verification run", () => {
  function controlledRuns() {
    const finishers: ((j: Judgement) => void)[] = [];
    vi.mocked(verifyDeliverable).mockImplementation(() => new Promise<Judgement>((resolve) => finishers.push(resolve)));
    return finishers;
  }

  it("is discarded when the freelancer resubmitted after it was interrupted", async () => {
    const finish = controlledRuns();
    const gig = await fundedGig();
    await gigs.submitWork(gig.id, "first try");
    await gigs.recoverStale((await getGig(gig.id))!, Date.now() + 6 * 60_000);
    await gigs.submitWork(gig.id, "second try");

    finish[0]({ ...judgement, summary: "verdict for the FIRST try" });
    await new Promise((r) => setTimeout(r, 10));
    expect((await getGig(gig.id))!).toMatchObject({ status: "verifying", verdict: null });

    finish[1]({ ...judgement, summary: "verdict for the SECOND try" });
    await vi.waitFor(async () => expect((await getGig(gig.id))!.status).toBe("verified"));
    expect((await getGig(gig.id))!.verdict!.summary).toBe("verdict for the SECOND try");
  });

  it("does not attach a verdict to a gig that went back to funded", async () => {
    const finish = controlledRuns();
    const gig = await fundedGig();
    await gigs.submitWork(gig.id, "first try");
    await gigs.recoverStale((await getGig(gig.id))!, Date.now() + 6 * 60_000);
    finish[0](judgement);
    await new Promise((r) => setTimeout(r, 10));
    expect((await getGig(gig.id))!).toMatchObject({ status: "funded", verdict: null });
  });
});

describe("request changes", () => {
  async function verifiedGig() {
    vi.mocked(verifyDeliverable).mockResolvedValue(judgement);
    const gig = await fundedGig();
    await gigs.submitWork(gig.id, "Done: https://github.com/a/b");
    await vi.waitFor(async () => expect((await getGig(gig.id))!.status).toBe("verified"));
    return gig;
  }

  it("sends the gig back to the freelancer with the money still held and nothing charged", async () => {
    const gig = await verifiedGig();
    vi.mocked(paypal.captureAuthorization).mockClear();
    await gigs.requestChanges(gig.id, "  Please add CI so the tests run.  ");
    expect((await getGig(gig.id))!).toMatchObject({ status: "funded", revisions: 1, authorizationId: "AUTH1", settlement: null });
    expect(paypal.captureAuthorization).not.toHaveBeenCalled();
    expect((await listEvents(gig.id)).at(-1)).toMatchObject({ actor: "client", type: "changes_requested", detail: "Please add CI so the tests run." });
  });

  it("lets the freelancer resubmit and gets a fresh check", async () => {
    const gig = await verifiedGig();
    await gigs.requestChanges(gig.id, "Add CI");
    vi.mocked(verifyDeliverable).mockResolvedValue({ ...judgement, summary: "Revised: all good." });
    await gigs.submitWork(gig.id, "Revised: https://github.com/a/b");
    await vi.waitFor(async () => expect((await getGig(gig.id))!.status).toBe("verified"));
    expect((await getGig(gig.id))!.verdict!.summary).toBe("Revised: all good.");
  });

  it("allows at most two change requests", async () => {
    const gig = await verifiedGig();
    for (let round = 1; round <= gigs.MAX_REVISIONS; round++) {
      await gigs.requestChanges(gig.id, `round ${round}`);
      await gigs.submitWork(gig.id, "again: https://github.com/a/b");
      await vi.waitFor(async () => expect((await getGig(gig.id))!.status).toBe("verified"));
    }
    await expect(gigs.requestChanges(gig.id, "one more")).rejects.toThrow("No change requests left");
    expect((await getGig(gig.id))!.status).toBe("verified");
  });

  it("needs a note, and only works while the client is reviewing", async () => {
    const gig = await verifiedGig();
    await expect(gigs.requestChanges(gig.id, "   ")).rejects.toThrow("Say what needs to change");
    await gigs.requestChanges(gig.id, "fix it");
    await expect(gigs.requestChanges(gig.id, "again")).rejects.toThrow("not waiting for your review");
  });
});
