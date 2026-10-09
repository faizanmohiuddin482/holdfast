// Fetches the links in a freelancer's submission so the agent judges the real work, not the description.
// The submission is untrusted, so every fetch is guarded against reaching internal addresses.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type Evidence = { url: string; ok: true; content: string } | { url: string; ok: false; error: string };

const MAX_LINKS = 6;
const MAX_CHARS = 12_000;
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;

export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'`)\]]+/gi) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, "")))].slice(0, MAX_LINKS);
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("only http(s) links are checked");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) throw new Error("internal host");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error("resolves to a private address");
}

/** fetch() that re-checks every redirect hop, with a timeout and a size cap. */
async function safeFetch(raw: string, headers: Record<string, string> = {}): Promise<{ body: string; type: string }> {
  let url = new URL(raw);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "HoldfastVerifier/1.0", ...headers },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("too large");
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error("too large");
    return { body: new TextDecoder().decode(buf), type: res.headers.get("content-type") ?? "" };
  }
  throw new Error("too many redirects");
}

export function htmlToText(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return title ? `TITLE: ${title}\n${body}` : body;
}

const clip = (s: string) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}\n[truncated]` : s);

async function fetchGitHubRepo(owner: string, repo: string): Promise<{ content: string; summary: string }> {
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const gh = { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const meta = JSON.parse((await safeFetch(api, gh)).body) as { description: string | null; default_branch: string; language: string | null; pushed_at: string };
  const [tree, readme, runs] = await Promise.all([
    safeFetch(`${api}/git/trees/${meta.default_branch}?recursive=1`, gh).then((r) => JSON.parse(r.body) as { tree: { path: string; type: string }[]; truncated: boolean }),
    safeFetch(`${api}/readme`, { ...gh, Accept: "application/vnd.github.raw" }).then((r) => r.body).catch(() => null),
    safeFetch(`${api}/actions/runs?branch=${meta.default_branch}&per_page=5`, gh)
      .then((r) => (JSON.parse(r.body) as { workflow_runs: { name: string; status: string; conclusion: string | null; created_at: string }[] }).workflow_runs)
      .catch(() => null),
  ]);
  const ci = runs === null ? "(could not read CI runs)" : runs.length === 0 ? "(no CI runs)" : runs.map((r) => `${r.name}: ${r.conclusion ?? r.status} (${r.created_at})`).join("\n");
  const files = tree.tree.filter((t) => t.type === "blob").map((t) => t.path);
  const ciSummary = runs?.length ? runs.slice(0, 3).map((r) => `${r.name} ${r.conclusion ?? r.status}`).join(", ") : "no CI runs";
  return {
    summary: `${files.length} files, ${readme ? "README found" : "no README"}, ${ciSummary}`,
    content: [
      `GITHUB REPO ${owner}/${repo}: ${meta.description ?? "(no description)"}; language ${meta.language ?? "unknown"}; last push ${meta.pushed_at}`,
      `FILES (${files.length}${tree.truncated ? "+, truncated" : ""}):\n${files.slice(0, 300).join("\n")}`,
      `LATEST CI RUNS ON ${meta.default_branch}:\n${ci}`,
      `README:\n${(readme ?? "(no README)").slice(0, 6_000)}`,
    ].join("\n\n"),
  };
}

export async function gatherEvidence(submission: string, onProgress: (line: string) => void = () => {}): Promise<Evidence[]> {
  const urls = extractUrls(submission);
  if (urls.length === 0) onProgress("The submission has no links to open");
  return Promise.all(
    urls.map(async (url): Promise<Evidence> => {
      try {
        const gh = new URL(url).hostname === "github.com" && url.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#]|$)/);
        if (gh) {
          const repo = await fetchGitHubRepo(gh[1], gh[2]);
          onProgress(`Opened ${url}: ${repo.summary}`);
          return { url, ok: true, content: clip(repo.content) };
        }
        const { body, type } = await safeFetch(url);
        const text = type.includes("html") ? htmlToText(body) : type.startsWith("text/") || type.includes("json") ? body : null;
        if (text === null) throw new Error(`unsupported content type ${type}`);
        const title = text.match(/^TITLE: (.+)$/m)?.[1];
        onProgress(`Opened ${url}: page loaded${title ? ` ("${title.slice(0, 80)}")` : ""}`);
        return { url, ok: true, content: clip(text) };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        onProgress(`Couldn't open ${url}: ${error}`);
        return { url, ok: false, error };
      }
    }),
  );
}
