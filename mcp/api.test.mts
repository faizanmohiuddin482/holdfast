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
