import type { GigEvent } from "./db";

/** If the most recent event is a failed or interrupted check, the reason to show the user. */
export function verificationProblem(events: GigEvent[]): string | null {
  const last = events.at(-1);
  return last && (last.type === "verification_failed" || last.type === "verification_interrupted") ? last.detail : null;
}

/** The client's change request the freelancer still has to answer, if any. */
export function latestChangeRequest(events: GigEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "work_submitted") return null;
    if (events[i].type === "changes_requested") return events[i].detail;
  }
  return null;
}
