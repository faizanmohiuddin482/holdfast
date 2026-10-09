import type { Gig, Role } from "@/lib/db";
import { moneyState } from "@/lib/money";
import { formatMoney } from "@/lib/settle";

export function MoneyTracker({ gig, role }: { gig: Gig; role: Role }) {
  const { nodes, sentence } = moneyState(gig, role);
  return (
    <section className="card" aria-labelledby="money-heading">
      <h2 id="money-heading" className="text-sm font-semibold text-ink-2">{role === "client" ? "Your money" : "Where the money is"}</h2>
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {nodes.map((n, i) => (
          <li key={n.key}
            className={`relative rounded-lg border p-3 text-center ${n.active ? "border-primary bg-primary-soft" : "border-line"}`}
            aria-current={n.active ? "true" : undefined}>
            <div className={`text-xs ${n.active ? "font-semibold text-primary" : "text-muted"}`}>{n.label}</div>
            <div className={`money mt-1 text-lg font-semibold ${n.active ? "text-ink" : "text-muted"}`}>{formatMoney(n.cents, gig.currency)}</div>
            {i < nodes.length - 1 && <span aria-hidden className="absolute top-1/2 -right-2 hidden -translate-y-1/2 text-line sm:block">›</span>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-ink-2">{sentence}</p>
    </section>
  );
}
