import type { GigEvent } from "@/lib/db";

const who: Record<GigEvent["actor"], string> = { client: "Client", freelancer: "Freelancer", agent: "AI", paypal: "PayPal" };

export function ActivityLog({ events }: { events: GigEvent[] }) {
  return (
    <details className="card">
      <summary className="cursor-pointer text-sm font-semibold">Activity ({events.length})</summary>
      <ol className="mt-3 space-y-2 text-sm">
        {events.map((e) => (
          <li key={e.id} className="flex gap-3">
            <time className="money w-14 shrink-0 text-xs text-muted" dateTime={e.at}>{new Date(e.at).toISOString().slice(11, 16)}</time>
            <div className="min-w-0">
              <span className="font-medium">{who[e.actor]}</span> <span className="text-ink-2">{e.type.replaceAll("_", " ")}</span>
              <div className="break-words text-xs text-muted">{e.detail}</div>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
