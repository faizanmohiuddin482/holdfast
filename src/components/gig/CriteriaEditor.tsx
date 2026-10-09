"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Clarification } from "@/lib/db";
import { post } from "../api";

type Row = { text: string; weight: number };

export function CriteriaEditor({ token, criteria, clarifications }: { token: string; criteria: Row[]; clarifications: Clarification[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(criteria.map((c) => ({ text: c.text, weight: c.weight })));
  const [answers, setAnswers] = useState(clarifications);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/t/${token}/draft`, { criteria: rows, clarifications: answers });
      await post(`/api/t/${token}/confirm`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {answers.length > 0 && (
        <div className="space-y-3 rounded-lg bg-warning-soft p-4">
          <p className="text-sm font-semibold text-warning">The AI found {answers.length} unclear {answers.length === 1 ? "point" : "points"} in your brief</p>
          {answers.map((c, i) => (
            <div key={c.question}>
              <label className="label" htmlFor={`q${i}`}>{c.question}</label>
              <input id={`q${i}`} className="input" value={c.answer} placeholder="Your answer (optional, but it prevents disputes)"
                onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? { ...a, answer: e.target.value } : a)))} />
            </div>
          ))}
        </div>
      )}
      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <span className="hidden w-6 pt-2 text-xs font-semibold text-muted sm:block">c{i + 1}</span>
            <textarea aria-label={`Criterion ${i + 1}`} rows={2} className="input flex-1 [field-sizing:content] min-h-16" value={r.text} onChange={(e) => update(i, { text: e.target.value })} />
            <div className="flex items-center gap-2">
              <select aria-label={`Weight of criterion ${i + 1}`} className="input w-auto" value={r.weight} onChange={(e) => update(i, { weight: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>Weight {w}</option>)}
              </select>
              <button type="button" className="btn-secondary px-3" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove criterion ${i + 1}`}>Remove</button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn-secondary" onClick={() => setRows([...rows, { text: "", weight: 3 }])}>Add an item</button>
      <p className="text-xs text-muted">Weight is how much an item counts toward the payment. Once you pay, the checklist is locked.</p>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div><button className="btn" onClick={confirm} disabled={busy}>{busy ? "Saving…" : "Looks right, continue to payment"}</button></div>
    </div>
  );
}
