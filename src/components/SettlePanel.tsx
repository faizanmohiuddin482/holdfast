"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, planSettlement } from "@/lib/settle";
import { post } from "./api";

export function SettlePanel(props: { token: string; amountCents: number; currency: string; recommendedPercent: number; feeBps: number }) {
  const router = useRouter();
  const [pct, setPct] = useState(props.recommendedPercent);
  const [adjusting, setAdjusting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = planSettlement(props.amountCents, pct, props.feeBps);
  const fmt = (c: number) => formatMoney(c, props.currency);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/t/${props.token}/settle`, { releasePercent: pct });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        {pct === props.recommendedPercent ? "The AI recommends releasing" : "You're releasing"} <strong className="text-ink">{pct}%</strong>
        {pct !== props.recommendedPercent && <> (recommended: {props.recommendedPercent}%)</>}.
      </p>
      <dl className="money grid grid-cols-2 gap-3 rounded-lg bg-page p-4 text-sm sm:grid-cols-3">
        <div><dt className="text-muted">You pay</dt><dd className="text-base font-semibold">{fmt(plan.captureCents)}</dd></div>
        <div><dt className="text-muted">Back to you</dt><dd className="text-base font-semibold">{fmt(plan.returnedCents)}</dd></div>
        <div><dt className="text-muted">Freelancer gets</dt><dd className="text-base font-semibold">{fmt(plan.payoutCents)}</dd><dd className="text-xs text-muted">after {fmt(plan.feeCents)} fee</dd></div>
      </dl>
      {adjusting && (
        <div>
          <label className="label" htmlFor="pct">Release {pct}%</label>
          <input id="pct" type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
        </div>
      )}
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button className="btn" onClick={approve} disabled={busy}>
          {busy ? "Paying…" : plan.kind === "void" ? "Release the hold back to me" : `Approve and pay ${fmt(plan.payoutCents)}`}
        </button>
        <button type="button" className="btn-secondary" onClick={() => { setAdjusting(!adjusting); setPct(props.recommendedPercent); }} disabled={busy}>
          {adjusting ? "Use the recommendation" : "Adjust amount"}
        </button>
      </div>
    </div>
  );
}
