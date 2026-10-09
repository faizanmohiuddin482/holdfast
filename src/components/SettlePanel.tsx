"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, planSettlement } from "@/lib/settle";
import { post } from "./api";

export function SettlePanel(props: { gigId: string; amountCents: number; currency: string; agentPercent: number; feeBps: number }) {
  const router = useRouter();
  const [pct, setPct] = useState(props.agentPercent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = planSettlement(props.amountCents, pct, props.feeBps);
  const fmt = (c: number) => formatMoney(c, props.currency);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/gigs/${props.gigId}/settle`, { releasePercent: pct });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="pct">Release</label>
          <span className="text-sm">
            <strong>{pct}%</strong>
            {pct !== props.agentPercent && <span className="text-muted"> (agent said {props.agentPercent}%)</span>}
          </span>
        </div>
        <input id="pct" type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
      </div>
      <dl className="grid grid-cols-2 gap-y-1 text-sm sm:grid-cols-4">
        <dt className="text-muted">Captured</dt><dd className="sm:text-right">{fmt(plan.captureCents)}</dd>
        <dt className="text-muted">To freelancer</dt><dd className="sm:text-right">{fmt(plan.payoutCents)}</dd>
        <dt className="text-muted">Platform fee</dt><dd className="sm:text-right">{fmt(plan.feeCents)}</dd>
        <dt className="text-muted">Back to you</dt><dd className="sm:text-right">{fmt(plan.returnedCents)}</dd>
      </dl>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn" onClick={approve} disabled={busy}>
        {busy ? "Settling with PayPal…" : plan.kind === "void" ? "Release the hold back to me" : `Approve and pay ${fmt(plan.payoutCents)}`}
      </button>
    </div>
  );
}
