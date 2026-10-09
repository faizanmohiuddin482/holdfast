import { notFound } from "next/navigation";
import { getGig, listEvents, type GigEvent } from "@/lib/db";
import { formatMoney, PLATFORM_FEE_BPS } from "@/lib/settle";
import { FundButtons } from "@/components/FundButtons";
import { SettlePanel } from "@/components/SettlePanel";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitWorkForm } from "@/components/SubmitWorkForm";

export const dynamic = "force-dynamic";

// Quest-log squares: filled = met, half = partly, empty = not met, dotted = couldn't check.
const square = {
  met: ["bg-blue", "Met"],
  partially_met: ["bg-[linear-gradient(to_right,var(--blue)_50%,transparent_50%)]", "Partly met"],
  not_met: ["bg-bg", "Not met"],
  cannot_verify: ["bg-bg border-dashed", "Couldn't verify"],
} as const;

const confirmed = new Set(["funds_held", "captured", "payout_sent", "hold_voided"]);
const raised = new Set(["settlement_failed", "verification_failed", "override"]);
const glyph = (e: GigEvent) => (confirmed.has(e.type) ? "■" : raised.has(e.type) ? "▲" : e.actor === "agent" ? "◆" : "□");

export default async function GigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gig = getGig(id);
  if (!gig) notFound();
  const events = listEvents(id);
  const results = new Map(gig.verdict?.results.map((r) => [r.criterionId, r]));
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? process.env.PAYPAL_CLIENT_ID ?? "";
  const v = gig.verdict;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="t-h1 max-w-2xl">{gig.title}</h1>
          <StatusBadge status={gig.status} />
        </div>
        <dl className="grid max-w-xl gap-1 text-sm">
          <div className="stat"><dt>Escrow</dt><dd className="font-bold">{formatMoney(gig.amountCents, gig.currency)}</dd></div>
          <div className="stat"><dt>Freelancer</dt><dd className="break-all">{gig.freelancerEmail}</dd></div>
          {gig.authorizationId && <div className="stat"><dt>PayPal hold</dt><dd className="font-mono text-xs">{gig.authorizationId}</dd></div>}
        </dl>
      </div>

      <section className="window window-double">
        <h2 className="t-h2 mb-4">Quest log · acceptance criteria</h2>
        <ol className="space-y-3">
          {gig.criteria.map((c) => {
            const r = results.get(c.id);
            const [fill, label] = r ? square[r.status] : ["bg-bg", "Pending"];
            return (
              <li key={c.id} className="flex gap-3 text-sm">
                <span className={`mt-0.5 h-4 w-4 shrink-0 border-2 border-ink ${fill}`} title={label} aria-label={label} role="img" />
                <div className="flex-1">
                  <div className={r?.status === "met" ? "text-ink" : ""}>{c.text}</div>
                  {r ? <div className="t-caption mt-1">{label.toUpperCase()} · {r.evidence}</div> : <div className="t-caption mt-1">WEIGHT: {c.weight}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {gig.status === "awaiting_funding" && (
        <section className="window space-y-3">
          <h2 className="t-h2">Client · fund the escrow</h2>
          <p className="text-sm text-ink-mute">PayPal authorizes the payment and holds it. Nothing is charged until the work is verified and you approve.</p>
          {clientId ? <FundButtons gigId={gig.id} currency={gig.currency} clientId={clientId} /> : <p className="text-sm text-warn">Set NEXT_PUBLIC_PAYPAL_CLIENT_ID to show PayPal checkout.</p>}
        </section>
      )}

      {gig.status === "funded" && (
        <section className="window space-y-3">
          <h2 className="t-h2">Freelancer · deliver</h2>
          <SubmitWorkForm gigId={gig.id} />
        </section>
      )}

      {gig.status === "verifying" && (
        <section className="window window-tint text-sm"><span className="cursor">Agent is opening the deliverable and checking each criterion</span></section>
      )}

      {v && (
        <section className="window space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="t-h2">Agent verdict</h2>
            <span className="t-caption">CONFIDENCE: {v.confidence.toUpperCase()} · {v.model}</span>
          </div>
          <p className="text-sm">
            Recommends releasing <span className="keybox font-bold">{v.releasePercent}%</span>. {v.summary}
          </p>
          {v.messageToFreelancer && (
            <div className="window window-tint !p-3 text-sm"><div className="t-label mb-1">Note to freelancer:</div>{v.messageToFreelancer}</div>
          )}
          {v.disputeDraft && (
            <details className="text-sm">
              <summary className="t-label cursor-pointer text-ink-mute hover:text-blue">Dispute summary, ready if you need it</summary>
              <p className="mt-2 whitespace-pre-wrap">{v.disputeDraft}</p>
            </details>
          )}
          {gig.status === "verified" && (
            <SettlePanel gigId={gig.id} amountCents={gig.amountCents} currency={gig.currency} agentPercent={v.releasePercent} feeBps={PLATFORM_FEE_BPS} />
          )}
        </section>
      )}

      <section>
        <h2 className="t-h2 mb-3">Receipts</h2>
        <ol className="window space-y-2 !p-4 text-xs">
          {events.map((e) => (
            <li key={e.id} className={`flex gap-3 ${confirmed.has(e.type) ? "text-ok" : raised.has(e.type) ? "text-warn" : "text-ink-mute"}`}>
              <span aria-hidden className="w-3 shrink-0">{glyph(e)}</span>
              <span className="w-16 shrink-0 tabular-nums">{new Date(e.at).toISOString().slice(11, 19)}</span>
              <span className="min-w-0 break-words">
                <span className="font-bold uppercase">{e.actor} {e.type.replaceAll("_", " ")}</span>
                {e.detail && <span className="text-ink-mute"> · {e.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
