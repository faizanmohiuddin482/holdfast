// The human's spending policy for an agent using Holdfast. Enforced before any money-moving call.
export type Policy = { maxGigUsd: number; minAutoReleasePercent: number };
export type Check = { ok: true } | { ok: false; reason: string };

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function policyFromEnv(env: Record<string, string | undefined> = process.env): Policy {
  return {
    maxGigUsd: num(env.HOLDFAST_MAX_GIG_USD, 100),
    minAutoReleasePercent: Math.min(100, num(env.HOLDFAST_MIN_AUTO_RELEASE_PERCENT, 90)),
  };
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export function checkCreate(amountUsd: number, policy: Policy): Check {
  return amountUsd > policy.maxGigUsd ? { ok: false, reason: `${usd(amountUsd)} is above your limit of ${usd(policy.maxGigUsd)} per gig` } : { ok: true };
}

export function checkRelease(view: { status: string; amount_usd: number; verdict: { release_percent: number } | null }, policy: Policy): Check {
  if (view.status !== "verified") return { ok: false, reason: `the gig is ${view.status}, not waiting for release` };
  if (!view.verdict) return { ok: false, reason: "there is no AI verdict yet" };
  if (view.amount_usd > policy.maxGigUsd) return { ok: false, reason: `${usd(view.amount_usd)} is above your limit of ${usd(policy.maxGigUsd)} per gig` };
  const pct = view.verdict.release_percent;
  if (pct !== 0 && pct < policy.minAutoReleasePercent) {
    return { ok: false, reason: `the AI recommends ${pct}%, below your automatic-release minimum of ${policy.minAutoReleasePercent}%` };
  }
  return { ok: true };
}
