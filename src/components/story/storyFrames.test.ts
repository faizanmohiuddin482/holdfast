import { describe, expect, it } from "vitest";
import { STORY, frame } from "./storyFrames";

describe("story frames", () => {
  it("has four steps", () => expect(STORY.map((s) => s.title)).toEqual(["You agree on what done means", "PayPal holds the money", "The AI checks the work", "You release what was delivered"]));

  it("highlights who acts, but moves the money only when money moves", () => {
    expect([0, 1, 2, 3].map((s) => frame(s).highlight)).toEqual([0, 1, 2, 3]);
    expect([0, 1, 2, 3].map((s) => frame(s).moneyAt)).toEqual([0, 1, 1, 3]);
  });

  it("shows the split on release", () => {
    expect(frame(3)).toMatchObject({ chip: "$114 paid", returned: "$30 back to you" });
    expect(frame(1).returned).toBeNull();
  });

  it("clamps out-of-range steps", () => {
    expect(frame(-1)).toEqual(frame(0));
    expect(frame(9)).toEqual(frame(3));
  });
});
