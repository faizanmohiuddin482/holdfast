# Holdfast MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any MCP-capable AI agent hire, verify and pay through Holdfast as the client, or deliver as the freelancer, within a human-set spending policy, and show this on the landing page.

**Architecture:** A local stdio MCP server (`mcp/*.mts`, run directly by Node's type stripping) calls Holdfast's existing HTTP API. One new read, `GET /api/t/{token}?view=full`, returns a role-safe JSON view built by a pure `gigView`. The spending policy is enforced in the MCP server before any money-moving call.

**Tech Stack:** Node 26 (type stripping), `@modelcontextprotocol/sdk` 1.30.1 (`McpServer.registerTool`, `StdioServerTransport`, `InMemoryTransport` + `Client` for tests), Zod 4, Next.js 15, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-09-mcp-server-design.md`

## Global Constraints

- Spending policy env: `HOLDFAST_MAX_GIG_USD` (default 100), `HOLDFAST_MIN_AUTO_RELEASE_PERCENT` (default 90).
- `release_payment` takes no percentage; it releases the AI's recommended % only, and only when the gig is `verified`, the amount is within the max, and the recommendation is ≥ the minimum or exactly 0.
- Money in always needs a human: the agent is given the client page link to hand to its human.
- The freelancer view never contains the client token or the client page link.
- `.mts` files must be valid under Node type stripping: no parameter properties, no enums, no namespaces; type-only imports use `import type`.
- The MCP server never writes to stdout except through the transport.
- No "escrow" wording in anything user-facing.
- Run `npx vitest run`, `npx tsc --noEmit`, `npm run lint` before every commit.

## Review Focus

- An agent passes a freelancer token to a client tool (`release_payment`, `update_checklist`) → refused with a clear message, no API write → Task 3 test.
- Holdfast isn't running or `HOLDFAST_URL` is wrong → every tool returns a readable "can't reach Holdfast" error instead of crashing → Task 3 api test.
- The agent answers a question the AI never asked → refused, pointing it to `get_gig` → Task 3 test.
- The agent calls `release_payment` twice → the second call is refused because the gig is no longer `verified` → Task 2 test.
- Anything printed to stdout corrupts the stdio protocol → Task 4 live smoke run through a real stdio client.

---

### Task 1: Role-safe gig view and `?view=full`

**Files:**
- Create: `src/lib/view.ts`, `src/lib/view.test.ts`
- Modify: `src/lib/route.ts` (pass `req` to handlers), `src/app/api/t/[token]/route.ts`

**Interfaces:**
- Consumes: `Gig`, `GigEvent`, `Role` (`src/lib/db.ts`); `moneyState` (`src/lib/money.ts`); `latestChangeRequest`, `verificationProblem` (`src/lib/events.ts`); `MAX_REVISIONS` (`src/lib/escrow.ts`).
- Produces: `nextStepText(gig, role, changeRequest: string | null): string`; `gigView(gig, role, events, progress: string[], origin: string)` returning a union discriminated by `role: "client" | "freelancer"`; `type GigView = ReturnType<typeof gigView>`; `handleToken` callbacks receive `(body, gig, role, req)`.

- [ ] **Step 1: Write the failing test** (`src/lib/view.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { createGig, type Gig } from "./db";
import { gigView, nextStepText } from "./view";

const gig = createGig({
  title: "Lib", brief: "A library with tests.", amountCents: 5000, currency: "USD", freelancerEmail: "f@example.com",
  criteria: [{ id: "c1", text: "Has a README", weight: 2 }, { id: "c2", text: "Tests pass in CI", weight: 3 }],
  clarifications: [{ question: "Which units?", answer: "" }, { question: "npm too?", answer: "No" }],
});
const at = (status: Gig["status"], extra: Partial<Gig> = {}): Gig => ({ ...gig, status, ...extra });

describe("gigView", () => {
  it("never gives the freelancer the client's token or page", () => {
    const v = gigView(gig, "freelancer", [], [], "https://h.test");
    const json = JSON.stringify(v);
    expect(json).not.toContain(gig.clientToken);
    expect(json).not.toContain("/c/");
    expect(v.links).toEqual({ freelancer_page: `https://h.test/f/${gig.freelancerToken}` });
    expect("open_questions" in v).toBe(false);
  });

  it("gives the client both links, the open questions and the answered ones", () => {
    const v = gigView(gig, "client", [], [], "https://h.test");
    if (v.role !== "client") throw new Error("expected client view");
    expect(v.links).toEqual({ client_page: `https://h.test/c/${gig.clientToken}`, freelancer_invite: `https://h.test/f/${gig.freelancerToken}` });
    expect(v.open_questions).toEqual(["Which units?"]);
    expect(v.answered_questions).toEqual([{ question: "npm too?", answer: "No" }]);
    expect(v.amount_usd).toBe(50);
  });

  it("maps the verdict with each item's text and source", () => {
    const verdict = {
      results: [{ criterionId: "c1", status: "met" as const, evidence: "README.md", sourceUrl: "https://github.com/a/b" }],
      confidence: "high" as const, summary: "Good", messageToFreelancer: "", disputeDraft: "", manipulationAttempt: "",
      model: "m", at: "", sources: [], releasePercent: 40, releaseWorking: "c1 2/2 · c2 0/3 → 2/5 = 40%",
    };
    const v = gigView(at("verified", { verdict }), "client", [], [], "https://h.test");
    expect(v.verdict).toMatchObject({
      release_percent: 40, release_working: "c1 2/2 · c2 0/3 → 2/5 = 40%",
      items: [{ id: "c1", text: "Has a README", status: "met", evidence: "README.md", source_url: "https://github.com/a/b" }],
    });
  });

  it("shows a pending change request to the freelancer while funded", () => {
    const events = [{ id: 1, actor: "client" as const, type: "changes_requested", detail: "Add CI", at: "" }];
    expect(gigView(at("funded", { revisions: 1 }), "freelancer", events, [], "https://h.test")).toMatchObject({ change_request: "Add CI", change_requests_left: 1 });
  });
});

describe("nextStepText", () => {
  it("tells each role what to do now", () => {
    expect(nextStepText(at("awaiting_funding"), "client", null)).toMatch(/approve the PayPal payment hold/i);
    expect(nextStepText(at("awaiting_funding"), "freelancer", null)).toMatch(/don't start/i);
    expect(nextStepText(at("funded"), "client", null)).toMatch(/freelancer_invite/);
    expect(nextStepText(at("funded"), "freelancer", "Add CI")).toMatch(/requested changes/i);
    expect(nextStepText(at("verified"), "client", null)).toMatch(/release_payment|request_changes/);
    expect(nextStepText(at("settled"), "freelancer", null)).toMatch(/complete/i);
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run src/lib/view.test.ts` → FAIL (cannot resolve `./view`).

- [ ] **Step 3: Implement `src/lib/view.ts`**

```ts
// A role-safe JSON view of a gig for API clients such as AI agents (the MCP server).
// The freelancer's view never contains the client's token or page.
import type { Gig, GigEvent, Role } from "./db";
import { MAX_REVISIONS } from "./escrow";
import { latestChangeRequest, verificationProblem } from "./events";
import { moneyState } from "./money";

export function nextStepText(gig: Gig, role: Role, changeRequest: string | null): string {
  const client = role === "client";
  switch (gig.status) {
    case "draft":
      return client
        ? "Review the AI's checklist with your human and answer its open questions (update_checklist), then call confirm_checklist."
        : "Wait: the client is still setting up the checklist.";
    case "awaiting_funding":
      return client
        ? "Ask your human to open links.client_page and approve the PayPal payment hold. Nothing is charged until payment is released."
        : "Wait: the client hasn't approved the payment hold yet. Don't start work.";
    case "funded":
      if (changeRequest) {
        return client
          ? "Wait for the freelancer's revised work. The money stays held."
          : "Make the requested changes, then submit the revised work with submit_work.";
      }
      return client
        ? "Send links.freelancer_invite to your freelancer."
        : "Do the work, then submit it with submit_work, including links (repo, live site, documents).";
    case "verifying":
      return "Wait: the AI is checking the work. Call get_gig again in a few seconds.";
    case "verified":
      return client
        ? "Review the AI's verdict: call release_payment to release the recommended share, or request_changes."
        : "Wait: the client is reviewing the AI's verdict.";
    case "settling":
      return "Wait: the payment is being sent.";
    case "failed":
      return client
        ? "The payout failed after the payment was taken. Ask your human to retry it at links.client_page."
        : "Wait: the payout is delayed; the client has been asked to retry.";
    case "settled":
      return "Nothing: this gig is complete.";
  }
}

export function gigView(gig: Gig, role: Role, events: GigEvent[], progress: string[], origin: string) {
  const changeRequest = gig.status === "funded" ? latestChangeRequest(events) : null;
  const textOf = (id: string) => gig.criteria.find((c) => c.id === id)?.text ?? id;
  const v = gig.verdict;
  const shared = {
    status: gig.status,
    title: gig.title,
    amount_usd: gig.amountCents / 100,
    currency: gig.currency,
    money: moneyState(gig, role),
    next_step: nextStepText(gig, role, changeRequest),
    checklist: gig.criteria,
    answered_questions: gig.clarifications.filter((c) => c.answer),
    progress,
    change_request: changeRequest,
    last_check_problem: gig.status === "funded" ? verificationProblem(events) : null,
    change_requests_left: Math.max(0, MAX_REVISIONS - gig.revisions),
    verdict: v
      ? {
          release_percent: v.releasePercent,
          release_working: v.releaseWorking ?? null,
          confidence: v.confidence,
          summary: v.summary,
          manipulation_attempt: v.manipulationAttempt || null,
          items: v.results.map((r) => ({ id: r.criterionId, text: textOf(r.criterionId), status: r.status, evidence: r.evidence, source_url: r.sourceUrl || null })),
        }
      : null,
  };
  if (role === "client") {
    return {
      role: "client" as const,
      ...shared,
      freelancer_email: gig.freelancerEmail,
      open_questions: gig.clarifications.filter((c) => !c.answer).map((c) => c.question),
      links: { client_page: `${origin}/c/${gig.clientToken}`, freelancer_invite: `${origin}/f/${gig.freelancerToken}` },
    };
  }
  return { role: "freelancer" as const, ...shared, links: { freelancer_page: `${origin}/f/${gig.freelancerToken}` } };
}

export type GigView = ReturnType<typeof gigView>;
```

- [ ] **Step 4: Run it** — `npx vitest run src/lib/view.test.ts` → 5 passed.

- [ ] **Step 5: Pass `req` to token handlers and serve the view**

In `src/lib/route.ts`, change the `handleToken` signature and call:

```ts
export function handleToken<T>(role: Role | "any", schema: z.ZodType<T>, fn: (body: T, gig: Gig, role: Role, req: Request) => Promise<unknown>) {
```

```ts
      return NextResponse.json((await fn(body.data, found.gig, found.role, req)) ?? { ok: true });
```

Replace `src/app/api/t/[token]/route.ts` with:

```ts
import { z } from "zod";
import { listEvents, listProgress } from "@/lib/db";
import { handleToken } from "@/lib/route";
import { gigView } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Default: the light payload the gig pages poll. ?view=full: the role-safe view for API clients and agents.
export const GET = handleToken("any", z.unknown(), async (_b, gig, role, req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("view") !== "full") return { status: gig.status, progress: listProgress(gig.id) };
  return gigView(gig, role, listEvents(gig.id), listProgress(gig.id), process.env.HOLDFAST_PUBLIC_URL ?? url.origin);
});
```

- [ ] **Step 6: Verify and commit** — `npx vitest run && npx tsc --noEmit && npm run lint` → all pass.

```bash
git add src/lib/view.ts src/lib/view.test.ts src/lib/route.ts "src/app/api/t/[token]/route.ts"
git commit -m "feat: role-safe gig view at /api/t/{token}?view=full"
```

---

### Task 2: Spending policy

**Files:**
- Create: `mcp/policy.mts`, `mcp/policy.test.mts`
- Modify: `tsconfig.json` (include `**/*.mts`, `allowImportingTsExtensions: true`)

**Interfaces:**
- Produces: `type Policy = { maxGigUsd: number; minAutoReleasePercent: number }`; `policyFromEnv(env?: Record<string, string | undefined>): Policy`; `type Check = { ok: true } | { ok: false; reason: string }`; `checkCreate(amountUsd: number, policy: Policy): Check`; `checkRelease(view: { status: string; amount_usd: number; verdict: { release_percent: number } | null }, policy: Policy): Check`.

- [ ] **Step 1: Update `tsconfig.json`**: add `"allowImportingTsExtensions": true` to `compilerOptions` and `"**/*.mts"` to `include`.

- [ ] **Step 2: Write the failing test** (`mcp/policy.test.mts`)

```ts
import { describe, expect, it } from "vitest";
import { checkCreate, checkRelease, policyFromEnv } from "./policy.mts";

const policy = { maxGigUsd: 100, minAutoReleasePercent: 90 };
const view = (o: Partial<{ status: string; amount_usd: number; verdict: { release_percent: number } | null }> = {}) => ({
  status: "verified", amount_usd: 50, verdict: { release_percent: 95 }, ...o,
});

describe("policyFromEnv", () => {
  it("defaults to $100 per gig and 90%", () => expect(policyFromEnv({})).toEqual(policy));
  it("reads overrides, ignores junk and caps the percent at 100", () => {
    expect(policyFromEnv({ HOLDFAST_MAX_GIG_USD: "250", HOLDFAST_MIN_AUTO_RELEASE_PERCENT: "80" })).toEqual({ maxGigUsd: 250, minAutoReleasePercent: 80 });
    expect(policyFromEnv({ HOLDFAST_MAX_GIG_USD: "lots", HOLDFAST_MIN_AUTO_RELEASE_PERCENT: "150" })).toEqual({ maxGigUsd: 100, minAutoReleasePercent: 100 });
  });
});

describe("checkCreate", () => {
  it("allows up to the limit and refuses above it", () => {
    expect(checkCreate(100, policy)).toEqual({ ok: true });
    expect(checkCreate(100.01, policy)).toEqual({ ok: false, reason: "$100.01 is above your limit of $100.00 per gig" });
  });
});

describe("checkRelease", () => {
  it("allows a recommendation at or above the minimum", () => {
    expect(checkRelease(view(), policy)).toEqual({ ok: true });
    expect(checkRelease(view({ verdict: { release_percent: 90 } }), policy)).toEqual({ ok: true });
  });
  it("allows 0%, which returns all the money to the human", () => {
    expect(checkRelease(view({ verdict: { release_percent: 0 } }), policy)).toEqual({ ok: true });
  });
  it("refuses a recommendation below the minimum", () => {
    expect(checkRelease(view({ verdict: { release_percent: 89 } }), policy)).toEqual({
      ok: false, reason: "the AI recommends 89%, below your automatic-release minimum of 90%",
    });
  });
  it("refuses gigs above the limit, gigs not awaiting release (e.g. a second release), and gigs without a verdict", () => {
    expect(checkRelease(view({ amount_usd: 150 }), policy)).toMatchObject({ ok: false, reason: "$150.00 is above your limit of $100.00 per gig" });
    expect(checkRelease(view({ status: "settled" }), policy)).toMatchObject({ ok: false, reason: "the gig is settled, not waiting for release" });
    expect(checkRelease(view({ verdict: null }), policy)).toMatchObject({ ok: false, reason: "there is no AI verdict yet" });
  });
});
```

- [ ] **Step 3: Run it** — `npx vitest run mcp/policy.test.mts` → FAIL (cannot resolve `./policy.mts`).

- [ ] **Step 4: Implement `mcp/policy.mts`**

```ts
// The human's spending policy for an agent using Holdfast. Enforced before any money-moving call.
export type Policy = { maxGigUsd: number; minAutoReleasePercent: number };
export type Check = { ok: true } | { ok: false; reason: string };

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function policyFromEnv(env: Record<string, string | undefined> = process.env): Policy {
  return {
    maxGigUsd: num(env.HOLDFAST_MAX_GIG_USD, 100),
    minAutoReleasePercent: Math.min(100, num(env.HOLDFAST_MIN_AUTO_RELEASE_PERCENT, 90)),
  };
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export function checkCreate(amountUsd: number, policy: Policy): Check {
  return amountUsd > policy.maxGigUsd ? { ok: false, reason: `${usd(amountUsd)} is above your limit of ${usd(policy.maxGigUsd)} per gig` } : { ok: true };
}

export function checkRelease(view: { status: string; amount_usd: number; verdict: { release_percent: number } | null }, policy: Policy): Check {
  if (view.status !== "verified") return { ok: false, reason: `the gig is ${view.status}, not waiting for release` };
  if (!view.verdict) return { ok: false, reason: "there is no AI verdict yet" };
  if (view.amount_usd > policy.maxGigUsd) return { ok: false, reason: `${usd(view.amount_usd)} is above your limit of ${usd(policy.maxGigUsd)} per gig` };
  const pct = view.verdict.release_percent;
  if (pct !== 0 && pct < policy.minAutoReleasePercent) {
    return { ok: false, reason: `the AI recommends ${pct}%, below your automatic-release minimum of ${policy.minAutoReleasePercent}%` };
  }
  return { ok: true };
}
```

- [ ] **Step 5: Run it, verify, commit** — `npx vitest run && npx tsc --noEmit && npm run lint` → pass.

```bash
git add mcp/policy.mts mcp/policy.test.mts tsconfig.json
git commit -m "feat(mcp): spending policy for agents"
```

---

### Task 3: API client and MCP tools

**Files:**
- Create: `mcp/api.mts`, `mcp/api.test.mts`, `mcp/server.mts`, `mcp/server.test.mts`

**Interfaces:**
- Consumes: `GigView` (Task 1, type-only); `Policy`, `checkCreate`, `checkRelease` (Task 2); API routes from the web app.
- Produces: `class HoldfastApiError extends Error { status: number }`; `holdfastApi(baseUrl: string, fetchImpl?: typeof fetch)` with methods `createGig({title, brief, amount, freelancerEmail}) → {clientToken}`, `view(token) → GigView`, `saveDraft(token, {criteria, clarifications})`, `confirm(token)`, `submit(token, submission)`, `requestChanges(token, note)`, `settle(token, releasePercent)`; `type HoldfastApi`; `createHoldfastMcp({ api, policy }) → McpServer` with tools `create_gig`, `update_checklist`, `confirm_checklist`, `get_gig`, `submit_work`, `request_changes`, `release_payment`.

- [ ] **Step 1: Write the failing api test** (`mcp/api.test.mts`)

```ts
import { describe, expect, it } from "vitest";
import { holdfastApi } from "./api.mts";

describe("holdfastApi", () => {
  it("turns API errors into readable errors", async () => {
    const api = holdfastApi("http://h.test/", async () => new Response(JSON.stringify({ error: "Only the client can do this" }), { status: 403 }));
    await expect(api.settle("FT", 100)).rejects.toMatchObject({ message: "Only the client can do this", status: 403 });
  });

  it("says plainly when Holdfast can't be reached", async () => {
    const api = holdfastApi("http://h.test", async () => { throw new TypeError("fetch failed"); });
    await expect(api.view("CT")).rejects.toThrow("Can't reach Holdfast at http://h.test. Is it running, and is HOLDFAST_URL right?");
  });

  it("calls the role-safe view", async () => {
    let called = "";
    const api = holdfastApi("http://h.test", async (url) => { called = String(url); return new Response("{}"); });
    await api.view("a b");
    expect(called).toBe("http://h.test/api/t/a%20b?view=full");
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run mcp/api.test.mts` → FAIL (cannot resolve `./api.mts`).

- [ ] **Step 3: Implement `mcp/api.mts`**

```ts
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
```

Run: `npx vitest run mcp/api.test.mts` → 3 passed.

- [ ] **Step 4: Write the failing server test** (`mcp/server.test.mts`)

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import type { HoldfastApi } from "./api.mts";
import { HoldfastApiError } from "./api.mts";
import { createHoldfastMcp } from "./server.mts";

const policy = { maxGigUsd: 100, minAutoReleasePercent: 90 };

const clientView = (o: Record<string, unknown> = {}) => ({
  role: "client", status: "verified", title: "Lib", amount_usd: 50, currency: "USD",
  money: { nodes: [], sentence: "Your $50.00 is held by PayPal." }, next_step: "Review the AI's verdict.",
  checklist: [{ id: "c1", text: "Has a README", weight: 2 }], answered_questions: [{ question: "npm too?", answer: "No" }],
  progress: [], change_request: null, last_check_problem: null, change_requests_left: 2,
  verdict: { release_percent: 95, release_working: "…", confidence: "high", summary: "Good", manipulation_attempt: null, items: [] },
  freelancer_email: "f@example.com", open_questions: ["Which units?"],
  links: { client_page: "http://h.test/c/CT", freelancer_invite: "http://h.test/f/FT" }, ...o,
});

function fakeApi(view: Record<string, unknown> = clientView()) {
  const ok = async () => ({ ok: true });
  return {
    createGig: vi.fn(async () => ({ clientToken: "CT" })),
    view: vi.fn(async () => view),
    saveDraft: vi.fn(ok), confirm: vi.fn(ok), submit: vi.fn(ok), requestChanges: vi.fn(ok), settle: vi.fn(ok),
  };
}

async function connect(api: ReturnType<typeof fakeApi>) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createHoldfastMcp({ api: api as unknown as HoldfastApi, policy }).connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

const text = (r: Awaited<ReturnType<Client["callTool"]>>) => (r.content as { type: string; text: string }[])[0].text;

describe("Holdfast MCP tools", () => {
  it("offers the seven tools", async () => {
    const { tools } = await (await connect(fakeApi())).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["confirm_checklist", "create_gig", "get_gig", "release_payment", "request_changes", "submit_work", "update_checklist"],
    );
  });

  it("create_gig refuses above the spending limit without calling Holdfast", async () => {
    const api = fakeApi();
    const r = await (await connect(api)).callTool({ name: "create_gig", arguments: { title: "Big job", brief: "A big job with many parts to it.", amount_usd: 500, freelancer_paypal_email: "f@example.com" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("$500.00 is above your limit of $100.00 per gig");
    expect(api.createGig).not.toHaveBeenCalled();
  });

  it("create_gig returns the client token and the AI's checklist", async () => {
    const api = fakeApi(clientView({ status: "draft", verdict: null }));
    const r = await (await connect(api)).callTool({ name: "create_gig", arguments: { title: "Lib", brief: "A library with tests and a README.", amount_usd: 50, freelancer_paypal_email: "f@example.com" } });
    expect(api.createGig).toHaveBeenCalledWith({ title: "Lib", brief: "A library with tests and a README.", amount: 50, freelancerEmail: "f@example.com" });
    expect(text(r)).toContain('"client_token": "CT"');
    expect(text(r)).toContain("1 open question");
  });

  it("update_checklist merges answers into the AI's questions", async () => {
    const api = fakeApi(clientView({ status: "draft" }));
    await (await connect(api)).callTool({ name: "update_checklist", arguments: { client_token: "CT", items: [{ text: "Has a README", weight: 3 }], answers: [{ question: "Which units?", answer: "ms to years" }] } });
    expect(api.saveDraft).toHaveBeenCalledWith("CT", {
      criteria: [{ text: "Has a README", weight: 3 }],
      clarifications: [{ question: "npm too?", answer: "No" }, { question: "Which units?", answer: "ms to years" }],
    });
  });

  it("update_checklist refuses answers to questions the AI never asked", async () => {
    const api = fakeApi(clientView({ status: "draft" }));
    const r = await (await connect(api)).callTool({ name: "update_checklist", arguments: { client_token: "CT", items: [{ text: "x", weight: 1 }], answers: [{ question: "Made up?", answer: "yes" }] } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("get_gig");
    expect(api.saveDraft).not.toHaveBeenCalled();
  });

  it("release_payment releases exactly the AI's recommendation within policy", async () => {
    const api = fakeApi();
    const r = await (await connect(api)).callTool({ name: "release_payment", arguments: { client_token: "CT" } });
    expect(r.isError).toBeFalsy();
    expect(api.settle).toHaveBeenCalledWith("CT", 95);
  });

  it("release_payment refuses outside the policy and points to the human's page", async () => {
    const api = fakeApi(clientView({ verdict: { release_percent: 60, release_working: "", confidence: "high", summary: "", manipulation_attempt: null, items: [] } }));
    const r = await (await connect(api)).callTool({ name: "release_payment", arguments: { client_token: "CT" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("below your automatic-release minimum of 90%");
    expect(text(r)).toContain("http://h.test/c/CT");
    expect(api.settle).not.toHaveBeenCalled();
  });

  it("client-only tools refuse a freelancer token", async () => {
    const api = fakeApi({ ...clientView(), role: "freelancer", links: { freelancer_page: "http://h.test/f/FT" } });
    const client = await connect(api);
    const r1 = await client.callTool({ name: "release_payment", arguments: { client_token: "FT" } });
    const r2 = await client.callTool({ name: "update_checklist", arguments: { client_token: "FT", items: [{ text: "x", weight: 1 }] } });
    expect([r1.isError, r2.isError]).toEqual([true, true]);
    expect(text(r1)).toContain("freelancer token");
    expect(api.settle).not.toHaveBeenCalled();
    expect(api.saveDraft).not.toHaveBeenCalled();
  });

  it("returns Holdfast's errors as tool errors instead of throwing", async () => {
    const api = fakeApi();
    api.submit.mockRejectedValue(new HoldfastApiError("Gig is draft; work can only be submitted once it's funded", 400));
    const r = await (await connect(api)).callTool({ name: "submit_work", arguments: { freelancer_token: "FT", submission: "Done: https://github.com/a/b" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("only be submitted once it's funded");
  });
});
```

- [ ] **Step 5: Run it** — `npx vitest run mcp/server.test.mts` → FAIL (cannot resolve `./server.mts`).

- [ ] **Step 6: Implement `mcp/server.mts`**

```ts
// Holdfast as MCP tools: an AI agent can hire (client) or deliver (freelancer), within its human's spending policy.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HoldfastApi } from "./api.mts";
import { checkCreate, checkRelease, type Policy } from "./policy.mts";

type Reply = { content: { type: "text"; text: string }[]; isError?: boolean };

const reply = (sentence: string, data?: unknown): Reply => ({
  content: [{ type: "text", text: data === undefined ? sentence : `${sentence}\n\n${JSON.stringify(data, null, 2)}` }],
});
const refuse = (message: string): Reply => ({ content: [{ type: "text", text: message }], isError: true });

async function run(fn: () => Promise<Reply>): Promise<Reply> {
  try {
    return await fn();
  } catch (err) {
    return refuse(err instanceof Error ? err.message : String(err));
  }
}

const INSTRUCTIONS =
  "Holdfast lets you hire someone for digital work without paying blind. PayPal holds the payment, an AI checks the " +
  "delivered work against an agreed checklist, and only the delivered share is paid. As the client: create_gig, review " +
  "the checklist with your human, confirm_checklist, then give your human links.client_page to approve the PayPal hold " +
  "(you can't approve payments yourself). Send links.freelancer_invite to the freelancer, poll get_gig, then " +
  "release_payment or request_changes. As the freelancer: get_gig, then submit_work. Keep tokens private: the client " +
  "token controls the payment.";

export function createHoldfastMcp({ api, policy }: { api: HoldfastApi; policy: Policy }) {
  const server = new McpServer({ name: "holdfast", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "create_gig",
    {
      title: "Hire someone",
      description: `Create a gig. The AI turns the brief into a weighted checklist and lists open questions. Amount is limited to $${policy.maxGigUsd} by your human's policy. Returns client_token (keep it private).`,
      inputSchema: {
        title: z.string().min(3).max(120),
        brief: z.string().min(20).max(8000).describe("What should be delivered and how you'll know it's done. Links make work checkable."),
        amount_usd: z.number().positive(),
        freelancer_paypal_email: z.email().describe("Where the freelancer is paid"),
      },
      annotations: { openWorldHint: true },
    },
    ({ title, brief, amount_usd, freelancer_paypal_email }) =>
      run(async () => {
        const check = checkCreate(amount_usd, policy);
        if (!check.ok) return refuse(`Outside your spending policy: ${check.reason}. Ask your human to create this gig on the Holdfast site instead.`);
        const { clientToken } = await api.createGig({ title, brief, amount: amount_usd, freelancerEmail: freelancer_paypal_email });
        const view = await api.view(clientToken);
        const open = view.role === "client" ? view.open_questions.length : 0;
        return reply(
          `Created "${title}". The AI drafted ${view.checklist.length} checklist items` +
            (open ? ` and has ${open} open question${open === 1 ? "" : "s"}` : "") +
            ". Review them with your human, adjust with update_checklist, then call confirm_checklist. Keep client_token private: it controls the payment.",
          { client_token: clientToken, ...view },
        );
      }),
  );

  server.registerTool(
    "update_checklist",
    {
      title: "Edit the checklist",
      description: "Replace the checklist items and answer the AI's open questions (match the question text exactly). Only while the gig is a draft.",
      inputSchema: {
        client_token: z.string(),
        items: z.array(z.object({ text: z.string().min(1).max(500), weight: z.number().int().min(1).max(5) })).min(1).max(12),
        answers: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
      },
    },
    ({ client_token, items, answers }) =>
      run(async () => {
        const view = await api.view(client_token);
        if (view.role !== "client") return refuse("Only the client can edit the checklist, and this is a freelancer token.");
        const asked = [...view.answered_questions, ...view.open_questions.map((question) => ({ question, answer: "" }))];
        const same = (a: string, b: string) => a.trim() === b.trim();
        const unknown = (answers ?? []).filter((a) => !asked.some((q) => same(q.question, a.question)));
        if (unknown.length) {
          return refuse(`These aren't questions the AI asked: ${unknown.map((a) => a.question).join(" | ")}. Call get_gig to see open_questions.`);
        }
        const clarifications = asked.map((q) => ({ question: q.question, answer: answers?.find((a) => same(a.question, q.question))?.answer ?? q.answer }));
        await api.saveDraft(client_token, { criteria: items, clarifications });
        return reply("Checklist saved. Call confirm_checklist when your human agrees with it.", await api.view(client_token));
      }),
  );

  server.registerTool(
    "confirm_checklist",
    { title: "Lock the checklist", description: "Lock the checklist. After this, your human must approve the PayPal payment hold.", inputSchema: { client_token: z.string() } },
    ({ client_token }) =>
      run(async () => {
        await api.confirm(client_token);
        const view = await api.view(client_token);
        if (view.role !== "client") return reply(view.next_step, view);
        return reply(
          `Checklist locked. Ask your human to open ${view.links.client_page} and approve the PayPal payment hold of $${view.amount_usd.toFixed(2)}. ` +
            `Nothing is charged until payment is released. Then send ${view.links.freelancer_invite} to the freelancer.`,
          view,
        );
      }),
  );

  server.registerTool(
    "get_gig",
    {
      title: "Check a gig",
      description: "Status, where the money is, what to do next, the checklist, live AI progress and the verdict with evidence. Works with a client or freelancer token.",
      inputSchema: { token: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ token }) =>
      run(async () => {
        const view = await api.view(token);
        return reply(view.next_step, view);
      }),
  );

  server.registerTool(
    "submit_work",
    {
      title: "Submit work (freelancer)",
      description: "Submit the delivered work with links (GitHub repo, live site, documents). The AI opens every link and checks it against the checklist.",
      inputSchema: { freelancer_token: z.string(), submission: z.string().min(10).max(20_000) },
    },
    ({ freelancer_token, submission }) =>
      run(async () => {
        await api.submit(freelancer_token, submission);
        return reply("Submitted. The AI is checking the work now; call get_gig in a few seconds to follow its progress.");
      }),
  );

  server.registerTool(
    "request_changes",
    {
      title: "Request changes",
      description: "Send the work back to the freelancer with a note. The money stays held. Limited number of change requests per gig.",
      inputSchema: { client_token: z.string(), note: z.string().min(1).max(2000) },
    },
    ({ client_token, note }) =>
      run(async () => {
        await api.requestChanges(client_token, note);
        const view = await api.view(client_token);
        return reply(`Sent back for changes; the money stays held. ${view.change_requests_left} change request(s) left.`, view);
      }),
  );

  server.registerTool(
    "release_payment",
    {
      title: "Release payment",
      description:
        `Release the AI's recommended share through PayPal; the rest goes back to your human. Allowed only when the recommendation is at least ` +
        `${policy.minAutoReleasePercent}% (or 0%, which returns everything) and the gig is at most $${policy.maxGigUsd}. You can't choose a different percentage.`,
      inputSchema: { client_token: z.string() },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    ({ client_token }) =>
      run(async () => {
        const view = await api.view(client_token);
        if (view.role !== "client") return refuse("Only the client can release payment, and this is a freelancer token.");
        const check = checkRelease(view, policy);
        if (!check.ok) return refuse(`Outside your spending policy: ${check.reason}. Ask your human to review and release it at ${view.links.client_page}`);
        const pct = view.verdict!.release_percent;
        await api.settle(client_token, pct);
        const after = await api.view(client_token);
        return reply(`Released ${pct}% as the AI recommended. ${after.money.sentence}`, after);
      }),
  );

  return server;
}
```

- [ ] **Step 7: Run tests** — `npx vitest run mcp` → all pass. Then `npx vitest run && npx tsc --noEmit && npm run lint`.

- [ ] **Step 8: Commit**

```bash
git add mcp/api.mts mcp/api.test.mts mcp/server.mts mcp/server.test.mts
git commit -m "feat(mcp): Holdfast tools for client and freelancer agents"
```

---

### Task 4: Stdio entry point, live smoke run, README

**Files:**
- Create: `mcp/index.mts`
- Modify: `package.json` (`"mcp": "node mcp/index.mts"`), `README.md` (new "Use it from an AI agent (MCP)" section)

**Interfaces:**
- Consumes: `holdfastApi` (Task 3), `policyFromEnv` (Task 2), `createHoldfastMcp` (Task 3).

- [ ] **Step 1: `mcp/index.mts`**

```ts
// Holdfast MCP server over stdio. Configure with HOLDFAST_URL and the spending policy env vars.
// Never write to stdout here: it carries the MCP protocol.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { holdfastApi } from "./api.mts";
import { policyFromEnv } from "./policy.mts";
import { createHoldfastMcp } from "./server.mts";

const server = createHoldfastMcp({ api: holdfastApi(process.env.HOLDFAST_URL ?? "http://localhost:3000"), policy: policyFromEnv() });
await server.connect(new StdioServerTransport());
```

`npm pkg set scripts.mcp="node mcp/index.mts"`.

- [ ] **Step 2: Live smoke run through a real stdio client** (throwaway script under the git-ignored workspace)

Write `.superpowers/sdd/2026-10-09-mcp-server/smoke.mts`:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["mcp/index.mts"],
  env: { ...process.env, HOLDFAST_URL: "http://localhost:3000" } as Record<string, string>,
  stderr: "inherit",
});
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);
const out = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);
console.log((await client.listTools()).tools.map((t) => t.name).join(", "));
const created = await client.callTool({ name: "create_gig", arguments: {
  title: "MCP smoke test", brief: "A public GitHub repository with a README that shows usage examples.", amount_usd: 5, freelancer_paypal_email: "freelancer@example.com" } });
console.log(out(created).split("\n")[0]);
const token = JSON.parse(out(created).slice(out(created).indexOf("{"))).client_token as string;
console.log(out(await client.callTool({ name: "confirm_checklist", arguments: { client_token: token } })).split("\n")[0]);
const tooBig = await client.callTool({ name: "create_gig", arguments: {
  title: "Too big", brief: "This one is above the spending limit on purpose.", amount_usd: 5000, freelancer_paypal_email: "freelancer@example.com" } });
console.log(tooBig.isError, out(tooBig));
console.log("TOKEN", token);
await client.close();
```

Run: `node .superpowers/sdd/2026-10-09-mcp-server/smoke.mts` with the dev server up.
Expected: the seven tool names; "Created "MCP smoke test". The AI drafted N checklist items…"; "Checklist locked. Ask your human to open http://localhost:3000/c/…"; `true Outside your spending policy: $5000.00 is above your limit of $100.00 per gig…`. Then delete that gig from `data/holdfast.db` (its id is looked up by its client token).

- [ ] **Step 3: README section** (after "PayPal APIs used")

````markdown
## Use it from an AI agent (MCP)

Holdfast ships an MCP server so an AI agent (Claude Code, Claude Desktop, any MCP client) can hire someone as the
client, or deliver as the freelancer.

| Tool | For | What it does |
|---|---|---|
| `create_gig` | client | Brief → AI checklist and open questions; returns the private client token |
| `update_checklist` / `confirm_checklist` | client | Edit items, answer the AI's questions, lock it; returns the link where the human approves the PayPal hold |
| `get_gig` | both | Status, where the money is, next step, live AI progress, verdict with evidence |
| `submit_work` | freelancer | Submit links; the AI checks them |
| `request_changes` | client | Send the work back; the money stays held |
| `release_payment` | client | Release the AI's recommended share, within the spending policy |

Guardrails: money in always needs a human (the agent hands over the PayPal approval link); `HOLDFAST_MAX_GIG_USD`
(default 100) caps each gig; `release_payment` only releases the AI's recommendation, and only automatically when it
is at least `HOLDFAST_MIN_AUTO_RELEASE_PERCENT` (default 90) or 0%. Anything else goes back to the human.

```bash
# Claude Code, from a clone of this repo (the app must be running)
claude mcp add holdfast -e HOLDFAST_URL=http://localhost:3000 -- node "$PWD/mcp/index.mts"
```

Claude Desktop (`claude_desktop_config.json`):

```json
{ "mcpServers": { "holdfast": { "command": "node", "args": ["/path/to/holdfast/mcp/index.mts"], "env": { "HOLDFAST_URL": "http://localhost:3000" } } } }
```
````

- [ ] **Step 4: Verify and commit** — `npx vitest run && npx tsc --noEmit && npm run lint`.

```bash
git add mcp/index.mts package.json README.md
git commit -m "feat(mcp): stdio entry point, npm run mcp, README"
```

---

### Task 5: Landing page section "Let your AI agent hire for you"

**Files:**
- Create: `src/components/agent/AgentSection.tsx`, `src/components/agent/ConnectAgent.tsx`
- Modify: `src/app/page.tsx` (render `<AgentSection />` after `<ScrollStory />`)

- [ ] **Step 1: `src/components/agent/ConnectAgent.tsx`**

```tsx
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
```

- [ ] **Step 2: `src/components/agent/AgentSection.tsx`**

```tsx
import { ConnectAgent } from "./ConnectAgent";

const chat = [
  { who: "you", text: "Hire someone to build a TypeScript time-conversion library for $50. Release the payment automatically if the AI scores it 90% or more." },
  { who: "agent", text: "Created the gig. The AI drafted 5 checklist items and has 2 questions: which time units, and does \"publish\" include npm?" },
  { who: "you", text: "Milliseconds to years. GitHub is enough." },
  { who: "agent", text: "Checklist locked. Please approve the $50.00 PayPal hold at your Holdfast link. Nothing is charged until I release it." },
  { who: "agent", text: "Hold approved, and I've sent the freelancer their link." },
  { who: "agent", text: "The work came in. The AI opened the repo and its CI: 5 of 5 items met, so it recommends 100%. That's within your policy, so I released it: $47.50 to the freelancer after the fee." },
] as const;

const guardrails = [
  ["Money in needs you", "Your agent can't approve a PayPal payment. It sends you the link."],
  ["Your limit, not the agent's", "Each gig is capped by the spending limit you set."],
  ["It can't overrule the AI", "Your agent releases only the AI's recommendation, and only above your threshold. Anything else comes back to you."],
] as const;

export function AgentSection() {
  return (
    <section aria-labelledby="agent-heading" className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-5">
        <span className="text-sm font-semibold text-primary">For AI agents</span>
        <h2 id="agent-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">Let your AI agent hire for you.</h2>
        <p className="max-w-md text-ink-2">
          Holdfast works as an MCP server, so an agent like Claude can post the job, wait for the work, check the AI&apos;s
          verdict and pay, inside limits you set. The freelancer can be an agent too.
        </p>
        <ul className="space-y-3">
          {guardrails.map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-soft text-xs text-success">✓</span>
              <div className="text-sm"><span className="font-semibold">{title}.</span> <span className="text-ink-2">{body}</span></div>
            </li>
          ))}
        </ul>
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold">Connect it</summary>
          <div className="mt-4"><ConnectAgent /></div>
        </details>
      </div>
      <div className="card space-y-3" aria-label="Example conversation with an agent">
        {chat.map((m, i) => (
          <div key={i} className={`flex ${m.who === "you" ? "justify-end" : "justify-start"}`}>
            <p className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.who === "you" ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-page text-ink"}`}>
              {m.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Render it** — in `src/app/page.tsx`, import `AgentSection` from `@/components/agent/AgentSection` and render `<AgentSection />` directly after `<ScrollStory />`.

- [ ] **Step 4: Verify** — `npx tsc --noEmit && npm run lint && npx vitest run`; open `http://localhost:3000`, scroll past the story: the section shows the chat, three guardrails and "Connect it" with a command containing the page's own origin.

- [ ] **Step 5: Commit**

```bash
git add src/components/agent src/app/page.tsx
git commit -m "feat: landing section on hiring through an AI agent (MCP)"
```
