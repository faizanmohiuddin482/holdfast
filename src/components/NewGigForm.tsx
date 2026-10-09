"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./api";
import { saveGig } from "./savedGigs";

export function NewGigForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const { clientToken } = await post<{ clientToken: string }>("/api/gigs", form);
      saveGig({ token: clientToken, title: form.title, amount: `$${Number(form.amount).toFixed(2)}`, createdAt: new Date().toISOString() });
      router.push(`/c/${clientToken}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Hire someone</h2>
        <p className="mt-1 text-sm text-ink-2">Describe the job. The AI turns it into a checklist you can review before paying anything.</p>
      </div>
      <div>
        <label className="label" htmlFor="title">What do you need?</label>
        <input id="title" name="title" required minLength={3} className="input" placeholder="Landing page for a coffee subscription" />
      </div>
      <div>
        <label className="label" htmlFor="brief">Describe the job</label>
        <textarea id="brief" name="brief" required minLength={20} rows={5} className="input"
          placeholder="What should be delivered, and how you'll know it's done. Links to a repo or live site are easiest to check." />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="amount">Amount (USD)</label>
          <input id="amount" name="amount" type="number" min="1" step="0.01" required className="input money" placeholder="150.00" />
          <p className="hint">Held by PayPal until you approve the work.</p>
        </div>
        <div>
          <label className="label" htmlFor="freelancerEmail">Freelancer&apos;s PayPal email</label>
          <input id="freelancerEmail" name="freelancerEmail" type="email" required className="input" placeholder="freelancer@example.com" />
          <p className="hint">They&apos;re paid here, so check it for typos.</p>
        </div>
      </div>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button className="btn w-full sm:w-auto" disabled={busy}>{busy ? "Writing your checklist…" : "Continue"}</button>
    </form>
  );
}
