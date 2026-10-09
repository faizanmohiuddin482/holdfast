import { notFound } from "next/navigation";
import { getGig, listEvents } from "@/lib/db";
import { formatMoney, PLATFORM_FEE_BPS } from "@/lib/settle";
import { FundButtons } from "@/components/FundButtons";
import { SettlePanel } from "@/components/SettlePanel";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitWorkForm } from "@/components/SubmitWorkForm";

export const dynamic = "force-dynamic";

const resultStyle = {
  met: ["Met", "bg-accent-soft text-accent"],
  partially_met: ["Partly", "bg-warn-soft text-warn"],
  not_met: ["Not met", "bg-bad-soft text-bad"],
  cannot_verify: ["Unverified", "bg-warn-soft text-warn"],
} as const;

export default async function GigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gig = getGig(id);
  if (!gig) notFound();
  const events = listEvents(id);
  const results = new Map(gig.verdict?.results.map((r) => [r.criterionId, r]));
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? process.env.PAYPAL_CLIENT_ID ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{gig.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatMoney(gig.amountCents, gig.currency)} · freelancer {gig.freelancerEmail}
          </p>
        </div>
        <StatusBadge status={gig.status} />
      </div>

      <section className="card">
        <h2 className="label">Acceptance criteria (drafted by the agent)</h2>
        <ol className="space-y-2">
          {gig.criteria.map((c) => {
            const r = results.get(c.id);
            return (
              <li key={c.id} className="flex gap-3 text-sm">
                <span className="w-6 shrink-0 font-mono text-xs text-muted">{c.id}</span>
                <div className="flex-1">
                  <div>{c.text}</div>
                  {r && <div className="mt-0.5 text-xs text-muted">{r.evidence}</div>}
                </div>
                {r ? (
                  <span className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${resultStyle[r.status][1]}`}>{resultStyle[r.status][0]}</span>
                ) : (
                  <span className="shrink-0 text-xs text-muted">weight {c.weight}</span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {gig.status === "awaiting_funding" && (
        <section className="card space-y-3">
          <h2 className="label">Client · fund the escrow</h2>
          <p className="text-sm text-muted">PayPal authorizes the payment and holds the funds. Nothing is charged until the work is verified and you approve.</p>
          {clientId ? <FundButtons gigId={gig.id} currency={gig.currency} clientId={clientId} /> : <p className="text-sm text-bad">Set NEXT_PUBLIC_PAYPAL_CLIENT_ID to show PayPal checkout.</p>}
        </section>
      )}

      {gig.status === "funded" && (
        <section className="card space-y-3">
          <h2 className="label">Freelancer · deliver</h2>
          <SubmitWorkForm gigId={gig.id} />
        </section>
      )}

      {gig.status === "verifying" && <section className="card text-sm">The agent is opening the deliverable and checking each criterion…</section>}

      {gig.verdict && (
        <section className="card space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="label">Agent verdict</h2>
            <span className="text-xs text-muted">{gig.verdict.confidence} confidence · {gig.verdict.model}</span>
          </div>
          <p className="text-sm">{gig.verdict.summary}</p>
          {gig.verdict.messageToFreelancer && (
            <div className="rounded-lg bg-background p-3 text-sm"><span className="label">Note to freelancer</span>{gig.verdict.messageToFreelancer}</div>
          )}
          {gig.verdict.disputeDraft && (
            <details className="text-sm"><summary className="cursor-pointer text-muted">Dispute summary, ready if you need it</summary><p className="mt-2 whitespace-pre-wrap">{gig.verdict.disputeDraft}</p></details>
          )}
          {gig.status === "verified" && (
            <SettlePanel gigId={gig.id} amountCents={gig.amountCents} currency={gig.currency} agentPercent={gig.verdict.releasePercent} feeBps={PLATFORM_FEE_BPS} />
          )}
        </section>
      )}

      <section>
        <h2 className="label">Activity</h2>
        <ol className="border-l border-line">
          {events.map((e) => (
            <li key={e.id} className="relative pb-3 pl-4 text-sm">
              <span className="absolute -left-[3px] top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="font-medium">{e.actor}</span> <span className="text-muted">{e.type.replaceAll("_", " ")}</span>
              <div className="break-words text-muted">{e.detail}</div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
