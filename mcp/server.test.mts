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
