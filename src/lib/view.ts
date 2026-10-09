// A role-safe JSON view of a gig for API clients such as AI agents (the MCP server).
// The freelancer's view never contains the client's token or page.
import type { Gig, GigEvent, Role } from "./db";
import { MAX_REVISIONS } from "./gigs";
import { latestChangeRequest, verificationProblem } from "./events";
import { moneyState } from "./money";

export function nextStepText(gig: Gig, role: Role, changeRequest: string | null): string {
  const client = role === "client";
  switch (gig.status) {
    case "draft":
      return client
        ? "Review the AI's checklist with your human and answer its open questions (update_checklist), then call confirm_checklist."
        : "Wait: the client is still setting up the checklist.";
    case "awaiting_funding":
      return client
        ? "Ask your human to open links.client_page and approve the PayPal payment hold. Nothing is charged until payment is released."
        : "Wait: the client hasn't approved the payment hold yet. Don't start work.";
    case "funded":
      if (changeRequest) {
        return client
          ? "Wait for the freelancer's revised work. The money stays held."
          : "Make the requested changes, then submit the revised work with submit_work.";
      }
      return client
        ? "Send links.freelancer_invite to your freelancer."
        : "Do the work, then submit it with submit_work, including links (repo, live site, documents).";
    case "verifying":
      return "Wait: the AI is checking the work. Call get_gig again in a few seconds.";
    case "verified":
      return client
        ? "Review the AI's verdict: call release_payment to release the recommended share, or request_changes."
        : "Wait: the client is reviewing the AI's verdict.";
    case "settling":
      return "Wait: the payment is being sent.";
    case "failed":
      return client
        ? "The payout failed after the payment was taken. Ask your human to retry it at links.client_page."
        : "Wait: the payout is delayed; the client has been asked to retry.";
    case "settled":
      return "Nothing: this gig is complete.";
  }
}

export function gigView(gig: Gig, role: Role, events: GigEvent[], progress: string[], origin: string) {
  const changeRequest = gig.status === "funded" ? latestChangeRequest(events) : null;
  const textOf = (id: string) => gig.criteria.find((c) => c.id === id)?.text ?? id;
  const v = gig.verdict;
  const shared = {
    status: gig.status,
    title: gig.title,
    amount_usd: gig.amountCents / 100,
    currency: gig.currency,
    money: moneyState(gig, role),
    next_step: nextStepText(gig, role, changeRequest),
    checklist: gig.criteria,
    answered_questions: gig.clarifications.filter((c) => c.answer),
    progress,
    change_request: changeRequest,
    last_check_problem: gig.status === "funded" ? verificationProblem(events) : null,
    change_requests_left: Math.max(0, MAX_REVISIONS - gig.revisions),
    verdict: v
      ? {
          release_percent: v.releasePercent,
          release_working: v.releaseWorking ?? null,
          confidence: v.confidence,
          summary: v.summary,
          manipulation_attempt: v.manipulationAttempt || null,
          items: v.results.map((r) => ({ id: r.criterionId, text: textOf(r.criterionId), status: r.status, evidence: r.evidence, source_url: r.sourceUrl || null })),
        }
      : null,
  };
  if (role === "client") {
    return {
      role: "client" as const,
      ...shared,
      freelancer_email: gig.freelancerEmail,
      open_questions: gig.clarifications.filter((c) => !c.answer).map((c) => c.question),
      links: { client_page: `${origin}/c/${gig.clientToken}`, freelancer_invite: `${origin}/f/${gig.freelancerToken}` },
    };
  }
  return { role: "freelancer" as const, ...shared, links: { freelancer_page: `${origin}/f/${gig.freelancerToken}` } };
}

export type GigView = ReturnType<typeof gigView>;
