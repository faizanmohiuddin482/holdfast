// Pure money math for settling a gig. Integer cents only.

export const PLATFORM_FEE_BPS = Number(process.env.HOLDFAST_FEE_BPS ?? 500); // 5%

export type Decision = "release" | "partial" | "reject";

export type SettlementPlan =
  | { kind: "void"; captureCents: 0; payoutCents: 0; feeCents: 0; returnedCents: number }
  | { kind: "capture"; captureCents: number; payoutCents: number; feeCents: number; returnedCents: number };

/**
 * Turn a release percentage into what gets captured from the hold, what the freelancer receives,
 * the platform fee, and what goes back to the client.
 */
export function planSettlement(amountCents: number, releasePercent: number, feeBps = PLATFORM_FEE_BPS): SettlementPlan {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error(`bad amount: ${amountCents}`);
  const pct = Math.min(100, Math.max(0, Math.round(releasePercent)));
  const captureCents = Math.round((amountCents * pct) / 100);
  if (captureCents === 0) {
    return { kind: "void", captureCents: 0, payoutCents: 0, feeCents: 0, returnedCents: amountCents };
  }
  const feeCents = Math.round((captureCents * feeBps) / 10_000);
  return {
    kind: "capture",
    captureCents,
    payoutCents: captureCents - feeCents,
    feeCents,
    returnedCents: amountCents - captureCents,
  };
}

export function decisionFor(releasePercent: number): Decision {
  if (releasePercent >= 100) return "release";
  if (releasePercent <= 0) return "reject";
  return "partial";
}

export const formatMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
