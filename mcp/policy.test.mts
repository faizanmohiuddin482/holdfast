import { describe, expect, it } from "vitest";
import { checkCreate, checkRelease, policyFromEnv } from "./policy.mts";

const policy = { maxGigUsd: 100, minAutoReleasePercent: 90 };
const view = (o: Partial<{ status: string; amount_usd: number; verdict: { release_percent: number } | null }> = {}) => ({
  status: "verified", amount_usd: 50, verdict: { release_percent: 95 }, ...o,
});

describe("policyFromEnv", () => {
  it("defaults to $100 per gig and 90%", () => expect(policyFromEnv({})).toEqual(policy));
  it("reads overrides, ignores junk and caps the percent at 100", () => {
    expect(policyFromEnv({ HOLDFAST_MAX_GIG_USD: "250", HOLDFAST_MIN_AUTO_RELEASE_PERCENT: "80" })).toEqual({ maxGigUsd: 250, minAutoReleasePercent: 80 });
    expect(policyFromEnv({ HOLDFAST_MAX_GIG_USD: "lots", HOLDFAST_MIN_AUTO_RELEASE_PERCENT: "150" })).toEqual({ maxGigUsd: 100, minAutoReleasePercent: 100 });
  });
});

describe("checkCreate", () => {
  it("allows up to the limit and refuses above it", () => {
    expect(checkCreate(100, policy)).toEqual({ ok: true });
    expect(checkCreate(100.01, policy)).toEqual({ ok: false, reason: "$100.01 is above your limit of $100.00 per gig" });
  });
});

describe("checkRelease", () => {
  it("allows a recommendation at or above the minimum", () => {
    expect(checkRelease(view(), policy)).toEqual({ ok: true });
    expect(checkRelease(view({ verdict: { release_percent: 90 } }), policy)).toEqual({ ok: true });
  });
  it("allows 0%, which returns all the money to the human", () => {
    expect(checkRelease(view({ verdict: { release_percent: 0 } }), policy)).toEqual({ ok: true });
  });
  it("refuses a recommendation below the minimum", () => {
    expect(checkRelease(view({ verdict: { release_percent: 89 } }), policy)).toEqual({
      ok: false, reason: "the AI recommends 89%, below your automatic-release minimum of 90%",
    });
  });
  it("refuses gigs above the limit, gigs not awaiting release (e.g. a second release), and gigs without a verdict", () => {
    expect(checkRelease(view({ amount_usd: 150 }), policy)).toMatchObject({ ok: false, reason: "$150.00 is above your limit of $100.00 per gig" });
    expect(checkRelease(view({ status: "settled" }), policy)).toMatchObject({ ok: false, reason: "the gig is settled, not waiting for release" });
    expect(checkRelease(view({ verdict: null }), policy)).toMatchObject({ ok: false, reason: "there is no AI verdict yet" });
  });
});
