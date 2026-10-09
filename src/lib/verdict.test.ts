import { describe, expect, it } from "vitest";
import { computeRelease } from "./verdict";

const criteria = [
  { id: "c1", weight: 5 },
  { id: "c2", weight: 4 },
  { id: "c3", weight: 4 },
  { id: "c4", weight: 5 },
  { id: "c5", weight: 3 },
];

describe("computeRelease", () => {
  it("weights met as 1, partly as 0.5, not met and unverifiable as 0", () => {
    const r = computeRelease(criteria, [
      { criterionId: "c1", status: "met" },
      { criterionId: "c2", status: "met" },
      { criterionId: "c3", status: "partially_met" },
      { criterionId: "c4", status: "not_met" },
      { criterionId: "c5", status: "met" },
    ]);
    expect(r).toEqual({ percent: 67, earned: 14, total: 21, working: "c1 5/5 · c2 4/4 · c3 2/4 · c4 0/5 · c5 3/3 → 14/21 = 67%" });
  });

  it("treats a criterion with no result as unverifiable", () => {
    expect(computeRelease([{ id: "c1", weight: 2 }, { id: "c2", weight: 2 }], [{ criterionId: "c1", status: "met" }]).percent).toBe(50);
  });

  it("ignores results for unknown criteria", () => {
    expect(computeRelease([{ id: "c1", weight: 1 }], [{ criterionId: "c1", status: "met" }, { criterionId: "zz", status: "not_met" }]).percent).toBe(100);
  });

  it("shows half points with one decimal", () => {
    expect(computeRelease([{ id: "c1", weight: 3 }], [{ criterionId: "c1", status: "partially_met" }]).working).toBe("c1 1.5/3 → 1.5/3 = 50%");
  });

  it("returns 0 for no criteria", () => {
    expect(computeRelease([], []).percent).toBe(0);
  });
});
