import Link from "next/link";
import { listGigs } from "@/lib/db";
import { formatMoney } from "@/lib/settle";
import { NewGigForm } from "@/components/NewGigForm";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default function Home() {
  const gigs = listGigs();
  return (
    <div className="space-y-10">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Pay for the work, not the promise.</h1>
        <p className="mt-3 text-muted">
          The client&apos;s money is held by PayPal, not paid out. When the freelancer delivers, an AI agent checks the work
          against the agreed criteria and recommends how much to release: all of it, part of it, or none.
          The client approves, and PayPal settles the rest.
        </p>
      </section>

      <section className="grid gap-8 md:grid-cols-[1fr_minmax(0,18rem)]">
        <NewGigForm />
        <div>
          <h2 className="label">Gigs</h2>
          {gigs.length === 0 ? (
            <p className="text-sm text-muted">No gigs yet.</p>
          ) : (
            <ul className="space-y-2">
              {gigs.map((g) => (
                <li key={g.id}>
                  <Link href={`/gigs/${g.id}`} className="card block !p-3 hover:border-accent">
                    <div className="truncate text-sm font-medium">{g.title}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted">
                      {formatMoney(g.amountCents, g.currency)}
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
