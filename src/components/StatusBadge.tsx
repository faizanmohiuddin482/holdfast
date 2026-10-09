import type { GigStatus } from "@/lib/db";

const styles: Record<GigStatus, [string, string]> = {
  awaiting_funding: ["Awaiting funding", "bg-warn-soft text-warn"],
  funded: ["Funds held", "bg-accent-soft text-accent"],
  verifying: ["Agent verifying", "bg-accent-soft text-accent"],
  verified: ["Awaiting release", "bg-warn-soft text-warn"],
  settling: ["Settling", "bg-accent-soft text-accent"],
  settled: ["Settled", "bg-accent-soft text-accent"],
  failed: ["Needs attention", "bg-bad-soft text-bad"],
};

export function StatusBadge({ status }: { status: GigStatus }) {
  const [label, cls] = styles[status];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
