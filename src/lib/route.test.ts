import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createGig } from "./db";
import { handleToken } from "./route";

const gig = await createGig({
  title: "T", brief: "B", criteria: [{ id: "c1", text: "x", weight: 1 }], clarifications: [],
  amountCents: 100, currency: "USD", freelancerEmail: "f@example.com",
});
const call = (h: ReturnType<typeof handleToken>, token: string) =>
  h(new Request("http://test/x", { method: "POST", body: "{}" }), { params: Promise.resolve({ token }) });

describe("handleToken", () => {
  const clientOnly = handleToken("client", z.object({}), async (_b, g, role) => ({ id: g.id, role }));
  const anyRole = handleToken("any", z.object({}), async (_b, g, role) => ({ role, status: g.status }));

  it("lets the right role through", async () => {
    const res = await call(clientOnly, gig.clientToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: gig.id, role: "client" });
  });

  it("refuses the other role with 403 and does not run the action", async () => {
    const res = await call(clientOnly, gig.freelancerToken);
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown token", async () => {
    expect((await call(clientOnly, "x".repeat(24))).status).toBe(404);
  });

  it("lets either role read status (the freelancer's tab sees the client's changes)", async () => {
    expect(await (await call(anyRole, gig.freelancerToken)).json()).toEqual({ role: "freelancer", status: "draft" });
  });
});
