import type { Gig } from "@/lib/db";

export function CriteriaCard({ gig }: { gig: Gig }) {
  const answered = gig.clarifications.filter((c) => c.answer);
  return (
    <section className="card">
      <h2 className="text-sm font-semibold">Agreed checklist</h2>
      <p className="hint">Both sides see the same list. The AI checks the work against it.</p>
      <ol className="mt-3 space-y-2">
        {gig.criteria.map((c) => (
          <li key={c.id} className="flex gap-3 text-sm">
            <span className="w-6 shrink-0 text-xs font-semibold text-muted">{c.id}</span>
            <span className="flex-1">{c.text}</span>
            <span className="shrink-0 text-xs text-muted">weight {c.weight}</span>
          </li>
        ))}
      </ol>
      {answered.length > 0 && (
        <dl className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
          {answered.map((c) => (
            <div key={c.question}>
              <dt className="text-ink-2">{c.question}</dt>
              <dd className="font-medium">{c.answer}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
