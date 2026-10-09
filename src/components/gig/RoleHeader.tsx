import type { Gig, Role } from "@/lib/db";
import { formatMoney } from "@/lib/settle";
import { StatusBadge } from "../StatusBadge";

export function RoleHeader({ gig, role }: { gig: Gig; role: Role }) {
  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="pill bg-primary text-white">{role === "client" ? "You're the client" : "You're the freelancer"}</span>
        <StatusBadge status={gig.status} />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{gig.title}</h1>
      <p className="text-sm text-ink-2">
        <span className="money">{formatMoney(gig.amountCents, gig.currency)}</span>
        {role === "client" ? <> · paying {gig.freelancerEmail}</> : <> · paid to {gig.freelancerEmail}, held by PayPal until the work is approved</>}
      </p>
    </header>
  );
}
