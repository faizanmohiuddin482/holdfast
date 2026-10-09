import type { GigStatus } from "@/lib/db";

const styles: Record<GigStatus, [string, string]> = {
  awaiting_funding: ["Awaiting funding", "bg-bg text-ink"],
  funded: ["Funds held", "bg-blue text-ink-inverse"],
  verifying: ["Agent verifying", "bg-blue-tint text-blue"],
  verified: ["Awaiting release", "border-warn bg-bg text-warn"],
  settling: ["Settling", "bg-blue-tint text-blue"],
  settled: ["Settled", "border-ok bg-bg text-ok"],
  failed: ["Needs attention", "border-warn bg-warn text-ink-inverse"],
};

export function StatusBadge({ status }: { status: GigStatus }) {
  const [label, cls] = styles[status];
  return <span className={`chip ${cls}`}>{label}</span>;
}
