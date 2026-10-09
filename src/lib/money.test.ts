import { describe, expect, it } from "vitest";
import { moneyState } from "./money";
import type { Gig } from "./db";

const base = { amountCents: 2000, currency: "USD", settlement: null } as const;
const gig = (status: Gig["status"], settlement: Gig["settlement"] = null) => ({ ...base, status, settlement });
const active = (s: ReturnType<typeof moneyState>) => s.nodes.filter((n) => n.active).map((n) => n.key);
const amounts = (s: ReturnType<typeof moneyState>) => Object.fromEntries(s.nodes.map((n) => [n.key, n.cents]));

describe("moneyState", () => {
  it("before funding, the money is still in the client's PayPal", () => {
    const s = moneyState(gig("awaiting_funding"), "client");
    expect(active(s)).toEqual(["source"]);
    expect(amounts(s)).toEqual({ source: 2000, held: 0, freelancer: 0, returned: 0 });
    expect(s.nodes.map((n) => n.label)).toEqual(["Your PayPal", "Held by PayPal", "Freelancer", "Back to you"]);
    expect(s.sentence).toContain("Nothing is charged yet");
  });

  it("while held, both roles see it held, in their own words", () => {
    for (const status of ["funded", "verifying", "verified"] as const) {
      const c = moneyState(gig(status), "client");
      const f = moneyState(gig(status), "freelancer");
      expect(active(c)).toEqual(["held"]);
      expect(amounts(c).held).toBe(2000);
      expect(c.sentence).toBe("Your $20.00 is held by PayPal. You haven't been charged, and nothing moves until you approve.");
      expect(f.sentence).toBe("The client's $20.00 is held by PayPal. You'll be paid when the work is approved.");
      expect(f.nodes.map((n) => n.label)).toEqual(["Client's PayPal", "Held by PayPal", "You", "Back to client"]);
    }
  });

  it("after a partial release, shows what was paid and what came back", () => {
    const st = { releasePercent: 10, captureCents: 200, payoutCents: 190, feeCents: 10, returnedCents: 1800 };
    const c = moneyState(gig("settled", st), "client");
    expect(amounts(c)).toEqual({ source: 0, held: 0, freelancer: 190, returned: 1800 });
    expect(active(c)).toEqual(["freelancer", "returned"]);
    expect(c.sentence).toBe("You were charged $2.00. $18.00 went back to your PayPal.");
    expect(moneyState(gig("settled", st), "freelancer").sentence).toBe("You received $1.90 ($2.00 minus a $0.10 fee).");
  });

  it("after a 0% release, nothing was charged", () => {
    const st = { releasePercent: 0, captureCents: 0, payoutCents: 0, feeCents: 0, returnedCents: 2000 };
    expect(moneyState(gig("settled", st), "client").sentence).toBe("You weren't charged. The full $20.00 hold went back to your PayPal.");
    expect(moneyState(gig("settled", st), "freelancer").sentence).toBe("This gig closed without a payment. The hold went back to the client.");
  });

  it("when the payout failed, the captured money is shown as held", () => {
    const st = { releasePercent: 100, captureCents: 2000, payoutCents: 1900, feeCents: 100, returnedCents: 0 };
    const c = moneyState(gig("failed", st), "client");
    expect(active(c)).toEqual(["held"]);
    expect(amounts(c).held).toBe(2000);
    expect(moneyState(gig("failed", st), "freelancer").sentence).toBe("$19.00 is approved for you, but the payout is delayed. The client has been asked to retry.");
  });
});
