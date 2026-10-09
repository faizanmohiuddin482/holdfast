"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./api";

export function SubmitWorkForm({ gigId }: { gigId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post(`/api/gigs/${gigId}/submit`, { submission: new FormData(e.currentTarget).get("submission") });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <textarea name="submission" required rows={6} className="input"
        placeholder="Describe what you delivered and link to it: repo, deployed URL, docs. The agent opens the links and checks them against each criterion." />
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? "Agent is checking the work…" : "Submit work for verification"}</button>
    </form>
  );
}
