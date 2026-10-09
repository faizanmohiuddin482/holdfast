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
      <div className="prompt">
        <textarea name="submission" required rows={6} className="input" disabled={busy}
          placeholder="What you delivered, with links: repo, deployed URL, docs. The agent opens each link and checks it against the criteria." />
      </div>
      {error && <p className="text-sm text-warn">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? <span className="cursor">Agent checking the work</span> : "Submit for verification"}</button>
    </form>
  );
}
