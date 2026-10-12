import { describe, expect, it } from "vitest";
import { createGig, type Gig } from "./db";
import { gigView, nextStepText } from "./view";

const gig = await createGig({
  title: "Lib", brief: "A library with tests.", amountCents: 5000, currency: "USD", freelancerEmail: "f@example.com",
  criteria: [{ id: "c1", text: "Has a README", weight: 2 }, { id: "c2", text: "Tests pass in CI", weight: 3 }],
  clarifications: [{ question: "Which units?", answer: "" }, { question: "npm too?", answer: "No" }],
});
const at = (status: Gig["status"], extra: Partial<Gig> = {}): Gig => ({ ...gig, status, ...extra });

describe("gigView", () => {
  it("never gives the freelancer the client's token or page", () => {
    const v = gigView(gig, "freelancer", [], [], "https://h.test");
    const json = JSON.stringify(v);
    expect(json).not.toContain(gig.clientToken);
    expect(json).not.toContain("/c/");
    expect(v.links).toEqual({ freelancer_page: `https://h.test/f/${gig.freelancerToken}` });
    expect("open_questions" in v).toBe(false);
  });

  it("gives the client both links, the open questions and the answered ones", () => {
    const v = gigView(gig, "client", [], [], "https://h.test");
    if (v.role !== "client") throw new Error("expected client view");
    expect(v.links).toEqual({ client_page: `https://h.test/c/${gig.clientToken}`, freelancer_invite: `https://h.test/f/${gig.freelancerToken}` });
    expect(v.open_questions).toEqual(["Which units?"]);
    expect(v.answered_questions).toEqual([{ question: "npm too?", answer: "No" }]);
    expect(v.amount_usd).toBe(50);
  });

  it("maps the verdict with each item's text and source", () => {
    const verdict = {
      results: [{ criterionId: "c1", status: "met" as const, evidence: "README.md", sourceUrl: "https://github.com/a/b" }],
      confidence: "high" as const, summary: "Good", messageToFreelancer: "", disputeDraft: "", manipulationAttempt: "",
      model: "m", at: "", sources: [], releasePercent: 40, releaseWorking: "c1 2/2 · c2 0/3 → 2/5 = 40%",
    };
    const v = gigView(at("verified", { verdict }), "client", [], [], "https://h.test");
    expect(v.verdict).toMatchObject({
      release_percent: 40, release_working: "c1 2/2 · c2 0/3 → 2/5 = 40%",
      items: [{ id: "c1", text: "Has a README", status: "met", evidence: "README.md", source_url: "https://github.com/a/b" }],
    });
  });

  it("shows a pending change request to the freelancer while funded", () => {
    const events = [{ id: 1, actor: "client" as const, type: "changes_requested", detail: "Add CI", at: "" }];
    expect(gigView(at("funded", { revisions: 1 }), "freelancer", events, [], "https://h.test")).toMatchObject({ change_request: "Add CI", change_requests_left: 1 });
  });
});

describe("nextStepText", () => {
  it("tells each role what to do now", () => {
    expect(nextStepText(at("awaiting_funding"), "client", null)).toMatch(/approve the PayPal payment hold/i);
    expect(nextStepText(at("awaiting_funding"), "freelancer", null)).toMatch(/don't start/i);
    expect(nextStepText(at("funded"), "client", null)).toMatch(/freelancer_invite/);
    expect(nextStepText(at("funded"), "freelancer", "Add CI")).toMatch(/requested changes/i);
    expect(nextStepText(at("verified"), "client", null)).toMatch(/release_payment|request_changes/);
    expect(nextStepText(at("settled"), "freelancer", null)).toMatch(/complete/i);
  });
});
