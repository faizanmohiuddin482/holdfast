import { describe, expect, it } from "vitest";
import { readSavedGigs, saveGig } from "./savedGigs";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const throwing = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };

describe("saved gigs", () => {
  it("saves newest first without duplicates", () => {
    const s = memory();
    saveGig({ token: "a", title: "A", amount: "$1.00", createdAt: "1" }, s);
    saveGig({ token: "b", title: "B", amount: "$2.00", createdAt: "2" }, s);
    saveGig({ token: "a", title: "A2", amount: "$1.00", createdAt: "3" }, s);
    expect(readSavedGigs(s).map((g) => g.title)).toEqual(["A2", "B"]);
  });

  it("never throws when storage is unavailable or corrupt", () => {
    expect(readSavedGigs(throwing)).toEqual([]);
    expect(() => saveGig({ token: "a", title: "A", amount: "$1.00", createdAt: "1" }, throwing)).not.toThrow();
    const s = memory();
    s.setItem("holdfast:my-gigs", "{not json");
    expect(readSavedGigs(s)).toEqual([]);
    expect(readSavedGigs(undefined)).toEqual([]);
  });
});
