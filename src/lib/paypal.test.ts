import { afterEach, describe, expect, it, vi } from "vitest";

describe("payoutToFreelancer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends Payouts v1 amounts as { value, currency }, not currency_code", async () => {
    process.env.PAYPAL_CLIENT_ID = "id";
    process.env.PAYPAL_CLIENT_SECRET = "secret";
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }));
      bodies.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ batch_header: { payout_batch_id: "B1", batch_status: "PENDING" } }), { status: 201 });
    }));
    const { payoutToFreelancer } = await import("./paypal");
    await payoutToFreelancer("gig1", "f@example.com", 190, "USD", "thanks");
    const item = (bodies[0].items as { amount: Record<string, string> }[])[0];
    expect(item.amount).toEqual({ value: "1.90", currency: "USD" });
    expect(bodies[0].sender_batch_header).toMatchObject({ sender_batch_id: "holdfast-gig1" });
  });
});
