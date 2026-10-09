"use client";
import { useEffect, useState } from "react";

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-2">{label}</span>
        <button type="button" onClick={copy} className="text-xs font-semibold text-primary hover:underline">{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-ink p-3 text-xs leading-relaxed text-white"><code>{value}</code></pre>
    </div>
  );
}

export function ConnectAgent() {
  const [origin, setOrigin] = useState("http://localhost:3000");
  useEffect(() => setOrigin(window.location.origin), []);
  const cli = `claude mcp add holdfast -e HOLDFAST_URL=${origin} -- node /path/to/holdfast/mcp/index.mts`;
  const desktop = JSON.stringify(
    { mcpServers: { holdfast: { command: "node", args: ["/path/to/holdfast/mcp/index.mts"], env: { HOLDFAST_URL: origin } } } },
    null,
    2,
  );
  return (
    <div className="space-y-4">
      <Copyable label="Claude Code" value={cli} />
      <Copyable label="Claude Desktop (claude_desktop_config.json)" value={desktop} />
      <p className="text-xs text-muted">Run from a clone of the Holdfast repo; replace /path/to/holdfast. Set HOLDFAST_MAX_GIG_USD and HOLDFAST_MIN_AUTO_RELEASE_PERCENT to change the limits.</p>
    </div>
  );
}
