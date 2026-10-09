import { describe, expect, it } from "vitest";
import type { GigEvent } from "./db";
import { latestChangeRequest, verificationProblem } from "./events";

const ev = (type: string, detail = ""): GigEvent => ({ id: 0, actor: "agent", type, detail, at: "" });

describe("verificationProblem", () => {
  it("explains why the gig came back from checking", () => {
    expect(verificationProblem([ev("work_submitted"), ev("verification_failed", "The AI service is busy right now.")]))
      .toBe("The AI service is busy right now.");
    expect(verificationProblem([ev("work_submitted"), ev("verification_interrupted", "Verification was interrupted. Please submit the work again.")]))
      .toBe("Verification was interrupted. Please submit the work again.");
  });

  it("says nothing when the last thing that happened wasn't a failed check", () => {
    expect(verificationProblem([])).toBeNull();
    expect(verificationProblem([ev("funds_held")])).toBeNull();
    expect(verificationProblem([ev("verification_failed", "busy"), ev("work_submitted")])).toBeNull();
  });
});

describe("latestChangeRequest", () => {
  it("returns the client's note until the freelancer resubmits", () => {
    expect(latestChangeRequest([ev("verdict"), ev("changes_requested", "Add CI")])).toBe("Add CI");
    expect(latestChangeRequest([ev("changes_requested", "Add CI"), ev("verification_failed", "busy")])).toBe("Add CI");
    expect(latestChangeRequest([ev("changes_requested", "Add CI"), ev("work_submitted")])).toBeNull();
    expect(latestChangeRequest([ev("funds_held")])).toBeNull();
  });
});
