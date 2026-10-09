"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./api";

export function RequestChanges({ token, suggested, left, total }: { token: string; suggested: string; left: number; total: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/t/${token}/request-changes`, { note });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Request changes instead</button>
        <span className="text-xs text-muted">{left} of {total} change requests left. Your money stays held.</span>
      </div>
    );
  }
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <label className="label" htmlFor="changes">What should the freelancer change?</label>
      <textarea id="changes" rows={4} className="input [field-sizing:content] min-h-24" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="hint">Pre-filled from the AI&apos;s findings. Edit it in your own words. Nothing is charged; the money stays held while they revise.</p>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn" onClick={send} disabled={busy || !note.trim()}>{busy ? "Sending…" : "Send back for changes"}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
