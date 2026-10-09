import { describe, expect, it } from "vitest";
import { extractUrls, gatherEvidence, htmlToText, isPrivateAddress } from "./evidence";

describe("extractUrls", () => {
  it("finds links, strips trailing punctuation, dedupes", () => {
    expect(extractUrls("Repo: https://github.com/a/b. Site (https://x.dev/page), again https://x.dev/page")).toEqual([
      "https://github.com/a/b",
      "https://x.dev/page",
    ]);
  });
  it("caps the number of links", () => {
    expect(extractUrls(Array.from({ length: 10 }, (_, i) => `https://e${i}.com`).join(" "))).toHaveLength(6);
  });
});

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0"])(
    "blocks %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "140.82.112.3", "172.32.0.1", "2606:4700::1111"])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("gatherEvidence", () => {
  it("refuses internal targets without making the request", async () => {
    const ev = await gatherEvidence("see http://localhost:3000/admin and http://169.254.169.254/latest/meta-data and file:///etc/passwd");
    expect(ev).toHaveLength(2);
    expect(ev.every((e) => !e.ok)).toBe(true);
  });
});

describe("htmlToText", () => {
  it("keeps title and visible text, drops scripts and styles", () => {
    const text = htmlToText("<html><head><title>Brew Co</title><style>p{}</style></head><body><h1>Plans</h1><script>evil()</script><p>Basic &amp; Pro</p></body></html>");
    expect(text).toContain("TITLE: Brew Co");
    expect(text).toContain("Basic & Pro");
    expect(text).not.toContain("evil");
  });
});
