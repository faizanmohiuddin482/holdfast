import type { GigEvent } from "./db";

/** If the most recent event is a failed or interrupted check, the reason to show the user. */
export function verificationProblem(events: GigEvent[]): string | null {
  const last = events.at(-1);
  return last && (last.type === "verification_failed" || last.type === "verification_interrupted") ? last.detail : null;
}
