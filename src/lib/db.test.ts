import { describe, expect, it } from "vitest";
import { createGig, getGigByToken, listEvents, listProgress, logEvent, updateGig, getGig } from "./db";

const input = {
  title: "Landing page",
  brief: "A landing page with three pricing tiers.",
  criteria: [{ id: "c1", text: "Has three tiers", weight: 3 }],
  clarifications: [{ question: "Monthly or yearly prices?", answer: "" }],
  amountCents: 2000,
  currency: "USD",
  freelancerEmail: "f@example.com",
};

describe("gigs", () => {
  it("creates a draft gig with two distinct 24-char tokens", () => {
    const gig = createGig(input);
    expect(gig.status).toBe("draft");
    expect(gig.clientToken).toMatch(/^[\w-]{24}$/);
    expect(gig.freelancerToken).toMatch(/^[\w-]{24}$/);
    expect(gig.clientToken).not.toBe(gig.freelancerToken);
    expect(gig.clarifications).toEqual(input.clarifications);
    expect(gig.settlement).toBeNull();
  });

  it("resolves each token to its role, and unknown tokens to null", () => {
    const gig = createGig(input);
    expect(getGigByToken(gig.clientToken)).toMatchObject({ role: "client", gig: { id: gig.id } });
    expect(getGigByToken(gig.freelancerToken)).toMatchObject({ role: "freelancer", gig: { id: gig.id } });
    expect(getGigByToken("nope")).toBeNull();
    expect(getGigByToken("")).toBeNull();
  });

  it("round-trips criteria, clarifications and settlement", () => {
    const gig = createGig(input);
    const settlement = { releasePercent: 60, captureCents: 1200, payoutCents: 1140, feeCents: 60, returnedCents: 800 };
    updateGig(gig.id, { criteria: [{ id: "c1", text: "Changed", weight: 5 }], clarifications: [{ question: "Q", answer: "A" }], settlement });
    const after = getGig(gig.id)!;
    expect(after.criteria[0].text).toBe("Changed");
    expect(after.clarifications).toEqual([{ question: "Q", answer: "A" }]);
    expect(after.settlement).toEqual(settlement);
  });
});

describe("events", () => {
  it("keeps progress lines out of the activity log and only returns the latest run's progress", () => {
    const gig = createGig(input);
    logEvent(gig.id, "freelancer", "work_submitted", "first try");
    logEvent(gig.id, "agent", "progress", "old line");
    logEvent(gig.id, "freelancer", "work_submitted", "second try");
    logEvent(gig.id, "agent", "progress", "Opened https://x.dev");
    logEvent(gig.id, "agent", "progress", "Judging 1 criteria");
    expect(listProgress(gig.id)).toEqual(["Opened https://x.dev", "Judging 1 criteria"]);
    expect(listEvents(gig.id).map((e) => e.type)).toEqual(["work_submitted", "work_submitted"]);
  });
});
