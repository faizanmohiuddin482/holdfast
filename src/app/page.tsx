import Link from "next/link";
import { listGigs } from "@/lib/db";
import { formatMoney } from "@/lib/settle";
import { NewGigForm } from "@/components/NewGigForm";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

const steps = [
  ["01", "Brief", "The agent turns your brief into checkable acceptance criteria."],
  ["02", "Hold", "PayPal authorizes the payment and holds it. Nothing is charged."],
  ["03", "Verify", "The agent opens the deliverable and checks every criterion."],
  ["04", "Release", "You approve. PayPal pays the earned share and returns the rest."],
] as const;

export default function Home() {
  const gigs = listGigs();
  return (
    <div className="space-y-12">
      <section className="max-w-2xl">
        <h1 className="t-display">
          Pay for the work, <span className="keybox not-italic font-mono text-[0.8em] font-bold">not the promise</span>.
        </h1>
        <p className="mt-4 text-ink-mute">
          Holdfast holds the client&apos;s money with PayPal. When the freelancer delivers, an AI agent checks the work
          against the agreed criteria and recommends how much to release: all of it, part of it, or none.
        </p>
      </section>

      <section id="how" className="grid border-2 border-ink sm:grid-cols-4">
        {steps.map(([n, title, body], i) => (
          <div key={n} className={`bg-bg p-4 ${i ? "border-t-2 border-ink sm:border-t-0 sm:border-l-2" : ""}`}>
            <div className="t-caption">{n}</div>
            <div className="t-h2 mt-1 text-blue">{title}</div>
            <p className="mt-2 text-xs leading-relaxed">{body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 md:grid-cols-[1fr_minmax(0,18rem)]">
        <NewGigForm />
        <div>
          <h2 className="t-h2 mb-3">Gigs</h2>
          {gigs.length === 0 ? (
            <div className="window window-tint t-caption">No gigs yet. Create one to start.</div>
          ) : (
            <ul className="space-y-3">
              {gigs.map((g) => (
                <li key={g.id}>
                  <Link href={`/gigs/${g.id}`} className="window block !p-3 hover:bg-blue-tint">
                    <div className="truncate text-sm font-bold">{g.title}</div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs">{formatMoney(g.amountCents, g.currency)}</span>
                      <StatusBadge status={g.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
