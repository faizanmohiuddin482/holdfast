"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./api";

export function RetryPayout({ gigId }: { gigId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function retry() {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/gigs/${gigId}/retry-payout`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 border-2 border-warn bg-bg p-4">
      <h3 className="t-h2 text-warn">Payout didn&apos;t go through</h3>
      <p className="text-sm">The client&apos;s payment was captured, but sending it to the freelancer failed. Retrying only resends the payout; nothing is charged again.</p>
      {error && <p className="text-sm text-warn">{error}</p>}
      <button className="btn" onClick={retry} disabled={busy}>{busy ? <span className="cursor">Sending payout</span> : "Retry payout"}</button>
    </div>
  );
}
