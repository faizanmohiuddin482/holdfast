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
