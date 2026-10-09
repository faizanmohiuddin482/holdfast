import { describe, expect, it } from "vitest";
import { decisionFor, planSettlement } from "./settle";

describe("planSettlement", () => {
  it("full release captures everything and takes the fee from the freelancer's share", () => {
    expect(planSettlement(20_000, 100, 500)).toEqual({
      kind: "capture",
      captureCents: 20_000,
      payoutCents: 19_000,
      feeCents: 1_000,
      returnedCents: 0,
    });
  });

  it("partial release returns the remainder to the client", () => {
    const plan = planSettlement(15_000, 60, 500);
    expect(plan).toMatchObject({ kind: "capture", captureCents: 9_000, returnedCents: 6_000, feeCents: 450, payoutCents: 8_550 });
  });

  it("zero percent voids the hold", () => {
    expect(planSettlement(15_000, 0)).toMatchObject({ kind: "void", returnedCents: 15_000 });
  });

  it("clamps out-of-range percentages and never loses a cent", () => {
    for (const pct of [-10, 33, 66.6, 150]) {
      const p = planSettlement(9_999, pct, 500);
      expect(p.captureCents + p.returnedCents).toBe(9_999);
      expect(p.payoutCents + p.feeCents).toBe(p.captureCents);
    }
  });

  it("rejects non-integer cents", () => {
    expect(() => planSettlement(10.5, 100)).toThrow();
  });
});

describe("decisionFor", () => {
  it("maps percentages to decisions", () => {
    expect(decisionFor(100)).toBe("release");
    expect(decisionFor(40)).toBe("partial");
    expect(decisionFor(0)).toBe("reject");
  });
});
