"use client";
import { useEffect, useState } from "react";

export function InvitePanel({ path }: { path: string }) {
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);
  useEffect(() => setUrl(`${window.location.origin}${path}`), [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input readOnly aria-label="Freelancer link" className="input flex-1 text-ink-2" value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
      </div>
      <a href={path} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-primary hover:underline">
        Preview what the freelancer sees ↗
      </a>
    </div>
  );
}
