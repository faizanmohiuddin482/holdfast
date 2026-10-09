import type { GigStatus } from "@/lib/db";

const styles: Record<GigStatus, [string, string]> = {
  draft: ["Setting up", "bg-page text-ink-2"],
  awaiting_funding: ["Waiting for payment", "bg-warning-soft text-warning"],
  funded: ["Money held", "bg-primary-soft text-primary"],
  verifying: ["AI checking", "bg-primary-soft text-primary"],
  verified: ["Awaiting approval", "bg-warning-soft text-warning"],
  settling: ["Paying out", "bg-primary-soft text-primary"],
  settled: ["Complete", "bg-success-soft text-success"],
  failed: ["Payout delayed", "bg-danger-soft text-danger"],
};

export function StatusBadge({ status }: { status: GigStatus }) {
  const [label, cls] = styles[status];
  return <span className={`pill ${cls}`}>{label}</span>;
}
