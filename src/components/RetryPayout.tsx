"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./api";

export function RetryPayout({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function retry() {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/t/${token}/retry-payout`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">Your payment went through, but sending it to the freelancer failed. Retrying only resends the payout; you won&apos;t be charged again.</p>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button className="btn" onClick={retry} disabled={busy}>{busy ? "Sending…" : "Retry payout"}</button>
    </div>
  );
}
