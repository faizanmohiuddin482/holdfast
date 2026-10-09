"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, planSettlement } from "@/lib/settle";
import { post } from "./api";
import { ProgressBar } from "./ProgressBar";

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
    <div className="space-y-4 border-2 border-warn bg-bg p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="t-h2 text-warn">Approve to release?</h3>
        <span className="t-caption">{pct === props.agentPercent ? "Agent's recommendation" : `Override: agent said ${props.agentPercent}%`}</span>
      </div>

      <div className="space-y-2">
        <div className="stat"><dt>Release</dt><dd className="font-bold">{pct}%</dd></div>
        <ProgressBar percent={pct} label="Share of escrow to release" />
        <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))}
          aria-label="Adjust release percentage" className="w-full accent-[var(--blue)]" />
      </div>

      <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        <div className="stat"><dt>Captured</dt><dd>{fmt(plan.captureCents)}</dd></div>
        <div className="stat"><dt>To freelancer</dt><dd className="font-bold">{fmt(plan.payoutCents)}</dd></div>
        <div className="stat"><dt>Platform fee</dt><dd>{fmt(plan.feeCents)}</dd></div>
        <div className="stat"><dt>Back to you</dt><dd>{fmt(plan.returnedCents)}</dd></div>
      </dl>

      {error && <p className="text-sm text-warn">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button className="btn" onClick={approve} disabled={busy}>
          {busy ? <span className="cursor">Settling</span> : plan.kind === "void" ? "Return full hold" : `Approve · pay ${fmt(plan.payoutCents)}`}
        </button>
        {pct !== props.agentPercent && (
          <button className="btn-ghost" onClick={() => setPct(props.agentPercent)} disabled={busy}>Reset to agent</button>
        )}
      </div>
    </div>
  );
}
