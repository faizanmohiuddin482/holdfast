import type { Gig, Role } from "@/lib/db";

const look = {
  met: { icon: "✓", label: "Met", cls: "bg-success-soft text-success" },
  partially_met: { icon: "◐", label: "Partly met", cls: "bg-warning-soft text-warning" },
  not_met: { icon: "✕", label: "Not met", cls: "bg-danger-soft text-danger" },
  cannot_verify: { icon: "?", label: "Couldn't check", cls: "bg-page text-ink-2" },
} as const;

export function VerdictCard({ gig, role }: { gig: Gig; role: Role }) {
  const v = gig.verdict!;
  const byId = new Map(v.results.map((r) => [r.criterionId, r]));
  return (
    <section className="card space-y-4" aria-labelledby="verdict-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="verdict-heading" className="text-lg font-semibold">{gig.status === "funded" ? "Last review" : "What the AI found"}</h2>
        <span className="text-xs text-muted">{v.confidence} confidence · {v.model}</span>
      </div>
      <p className="text-sm text-ink-2">{v.summary}</p>

      {v.manipulationAttempt && (
        <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
          <p className="font-semibold text-warning">The submission tried to instruct the reviewer. It was ignored.</p>
          <blockquote className="mt-1 break-words text-ink-2">&ldquo;{v.manipulationAttempt}&rdquo;</blockquote>
        </div>
      )}

      <ol className="space-y-2">
        {gig.criteria.map((c) => {
          const r = byId.get(c.id);
          const s = look[r?.status ?? "cannot_verify"];
          return (
            <li key={c.id} className="flex gap-3 rounded-lg border border-line p-3">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.cls}`} aria-label={s.label}>{s.icon}</span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">{c.text}</div>
                {r && <p className="mt-0.5 break-words text-ink-2">{r.evidence}</p>}
                {r?.sourceUrl && (
                  <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-xs text-primary hover:underline">{r.sourceUrl}</a>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted">{s.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="rounded-lg bg-page p-3 text-sm">
        <p><span className="font-semibold">Recommended release: {v.releasePercent}%</span></p>
        {v.releaseWorking && <p className="money mt-1 break-words text-xs text-ink-2">How it was worked out: {v.releaseWorking}. Met counts fully, partly met counts half.</p>}
      </div>

      {v.messageToFreelancer && (
        <div className="text-sm">
          <p className="font-semibold">{role === "freelancer" ? "Feedback for you" : "Feedback for the freelancer"}</p>
          <p className="mt-1 text-ink-2">{v.messageToFreelancer}</p>
        </div>
      )}

      {v.sources && v.sources.length > 0 && (
        <p className="break-words text-xs text-muted">
          Links checked:{" "}
          {v.sources.map((s, i) => (
            <span key={s.url}>{i > 0 && ", "}<a href={s.url} target="_blank" rel="noreferrer" className={s.ok ? "text-primary hover:underline" : "text-danger line-through"}>{s.url}</a></span>
          ))}
        </p>
      )}

      {role === "client" && v.disputeDraft && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-ink-2">Dispute summary, ready if you need it</summary>
          <p className="mt-2 whitespace-pre-wrap text-ink-2">{v.disputeDraft}</p>
        </details>
      )}
    </section>
  );
}
