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

describe("captureAuthorization", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses a different idempotency key for a different amount, so a retry can't silently reuse an old capture", async () => {
    process.env.PAYPAL_CLIENT_ID = "id";
    process.env.PAYPAL_CLIENT_SECRET = "secret";
    const keys: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }));
      keys.push((init.headers as Record<string, string>)["PayPal-Request-Id"]);
      return new Response(JSON.stringify({ id: "CAP", status: "COMPLETED" }), { status: 201 });
    }));
    const { captureAuthorization } = await import("./paypal");
    await captureAuthorization("AUTH1", 1200, "USD", "n");
    await captureAuthorization("AUTH1", 1200, "USD", "n");
    await captureAuthorization("AUTH1", 2000, "USD", "n");
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});
