"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./api";

export function SubmitWorkForm({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post(`/api/t/${token}/submit`, { submission: new FormData(e.currentTarget).get("submission") });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="label" htmlFor="submission">What did you deliver?</label>
      <textarea id="submission" name="submission" required minLength={10} rows={5} className="input" disabled={busy}
        placeholder="Describe the work and paste links: GitHub repo, live site, documents. The AI opens every link." />
      <p className="hint">Public links work best. The AI can read GitHub repos, including their CI results.</p>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? "Sending…" : "Submit for review"}</button>
    </form>
  );
}
