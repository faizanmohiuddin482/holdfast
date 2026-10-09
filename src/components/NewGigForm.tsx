"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./api";

export function NewGigForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const { id } = await post<{ id: string }>("/api/gigs", Object.fromEntries(f));
      router.push(`/gigs/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <div>
        <label className="label" htmlFor="title">Gig</label>
        <input id="title" name="title" required className="input" placeholder="Landing page for a coffee subscription" />
      </div>
      <div>
        <label className="label" htmlFor="brief">Brief</label>
        <textarea id="brief" name="brief" required rows={6} className="input"
          placeholder="What you need, in plain words. The agent turns this into acceptance criteria before any money is held." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="amount">Amount (USD)</label>
          <input id="amount" name="amount" type="number" min="1" step="0.01" required className="input" placeholder="150" />
        </div>
        <div>
          <label className="label" htmlFor="freelancerEmail">Freelancer&apos;s PayPal email</label>
          <input id="freelancerEmail" name="freelancerEmail" type="email" required className="input" placeholder="sb-freelancer@personal.example.com" />
        </div>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? "Drafting acceptance criteria…" : "Create gig"}</button>
    </form>
  );
}
