// Minimal client for Holdfast's HTTP API, used by the MCP server.
import type { GigView } from "../src/lib/view.ts";

export class HoldfastApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Draft = { criteria: { text: string; weight: number }[]; clarifications: { question: string; answer: string }[] };

export function holdfastApi(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const base = baseUrl.replace(/\/+$/, "");

  async function call<T>(path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(
        `${base}${path}`,
        body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
    } catch {
      throw new HoldfastApiError(`Can't reach Holdfast at ${base}. Is it running, and is HOLDFAST_URL right?`, 0);
    }
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new HoldfastApiError(json.error ?? `Holdfast returned HTTP ${res.status}`, res.status);
    return json as T;
  }

  const t = (token: string) => `/api/t/${encodeURIComponent(token)}`;
  return {
    createGig: (b: { title: string; brief: string; amount: number; freelancerEmail: string }) => call<{ clientToken: string }>("/api/gigs", b),
    view: (token: string) => call<GigView>(`${t(token)}?view=full`),
    saveDraft: (token: string, draft: Draft) => call(`${t(token)}/draft`, draft),
    confirm: (token: string) => call(`${t(token)}/confirm`, {}),
    submit: (token: string, submission: string) => call(`${t(token)}/submit`, { submission }),
    requestChanges: (token: string, note: string) => call(`${t(token)}/request-changes`, { note }),
    settle: (token: string, releasePercent: number) => call(`${t(token)}/settle`, { releasePercent }),
  };
}

export type HoldfastApi = ReturnType<typeof holdfastApi>;
