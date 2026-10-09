// Gig lifecycle: draft (review criteria) -> fund (PayPal hold) -> submit -> AI verifies (background) -> settle.
// Every rule that changes a gig or moves money lives here; pages and API routes only call into it.
import { draftCriteria, verifyDeliverable, type Verdict } from "./agent";
import { createGig, failVerification, finishVerification, getGig, getGigByToken, lastEventAt, logEvent, transition, updateGig, type Clarification, type Gig } from "./db";
import * as paypal from "./paypal";
import { decisionFor, formatMoney, planSettlement } from "./settle";
import { computeRelease } from "./verdict";

const STALE_MS = 5 * 60_000;
/** Change requests a client may make per gig; after that they release a share or 0%. Protects the freelancer. */
export const MAX_REVISIONS = 2;

export class GigError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function mustGet(id: string): Promise<Gig> {
  const gig = await getGig(id);
  if (!gig) throw new GigError("Gig not found", 404);
  return gig;
}

/** A gig left in `verifying` by a server restart goes back to `funded` so the freelancer can resubmit. */
export async function recoverStale(gig: Gig, now = Date.now()): Promise<Gig> {
  if (gig.status !== "verifying") return gig;
  const last = await lastEventAt(gig.id);
  if (last && now - Date.parse(last) < STALE_MS) return gig;
  if (await transition(gig.id, "verifying", "funded")) {
    await logEvent(gig.id, "agent", "verification_interrupted", "Verification was interrupted. Please submit the work again.");
  }
  return mustGet(gig.id);
}

export async function lookup(token: string) {
  const found = await getGigByToken(token);
  return found ? { gig: await recoverStale(found.gig), role: found.role } : null;
}

export async function openGig(input: { title: string; brief: string; amountCents: number; currency: string; freelancerEmail: string }) {
  const { criteria, ambiguities } = await draftCriteria(input.title, input.brief);
  const gig = await createGig({ ...input, criteria, clarifications: ambiguities.map((question) => ({ question, answer: "" })) });
  await logEvent(gig.id, "client", "gig_created", `${input.title}: ${formatMoney(input.amountCents, input.currency)}`);
  await logEvent(gig.id, "agent", "criteria_drafted", `${criteria.length} acceptance criteria, ${ambiguities.length} open questions`);
  return gig;
}

export async function saveDraft(id: string, draft: { criteria: { text: string; weight: number }[]; clarifications: Clarification[] }) {
  const gig = await mustGet(id);
  if (gig.status !== "draft") throw new GigError("The criteria are locked and can't be edited once the gig is funded");
  if (draft.criteria.length === 0) throw new GigError("Add at least one criterion");
  if (draft.criteria.some((c) => !c.text.trim())) throw new GigError("Every criterion needs some text");
  const criteria = draft.criteria.map((c, i) => ({ id: `c${i + 1}`, text: c.text.trim(), weight: Math.min(5, Math.max(1, Math.round(c.weight))) }));
  const clarifications = draft.clarifications.map((c) => ({ question: c.question, answer: c.answer.trim() }));
  await updateGig(id, { criteria, clarifications });
}

export async function confirmCriteria(id: string) {
  const gig = await mustGet(id);
  if (!(await transition(id, "draft", "awaiting_funding"))) throw new GigError(`Gig is ${gig.status}, not a draft`);
  await logEvent(id, "client", "criteria_confirmed", `${gig.criteria.length} criteria agreed`);
}

export async function startFunding(id: string) {
  const gig = await mustGet(id);
  if (gig.status !== "awaiting_funding") throw new GigError(`Gig is ${gig.status}, not awaiting funding`);
  const orderId = await paypal.createEscrowOrder(gig.id, gig.title, gig.amountCents, gig.currency);
  await updateGig(id, { orderId });
  await logEvent(id, "paypal", "order_created", orderId);
  return orderId;
}

export async function completeFunding(id: string, orderId: string) {
  const gig = await mustGet(id);
  if (gig.orderId !== orderId) throw new GigError("Order does not belong to this gig");
  if (!(await transition(id, "awaiting_funding", "funded"))) throw new GigError(`Gig is ${gig.status}, not awaiting funding`);
  try {
    const auth = await paypal.authorizeOrder(orderId);
    await updateGig(id, { authorizationId: auth.authorizationId });
    await logEvent(id, "paypal", "funds_held", `Authorization ${auth.authorizationId} (${auth.status})` + (auth.expiresAt ? `, valid until ${auth.expiresAt}` : ""));
  } catch (err) {
    await transition(id, "funded", "awaiting_funding");
    throw err;
  }
}

/** Starts verification and returns; the pages poll for progress and the verdict. */
export async function submitWork(id: string, submission: string) {
  const gig = await mustGet(id);
  if (!(await transition(id, "funded", "verifying"))) throw new GigError(`Gig is ${gig.status}; work can only be submitted once it's funded`);
  const runId = await logEvent(id, "freelancer", "work_submitted", submission.slice(0, 500));
  void runVerification(gig, submission, runId);
}

async function runVerification(gig: Gig, submission: string, runId: number) {
  const id = gig.id;
  // Progress lines are written in order, one at a time, and all of them land before the verdict.
  let progress: Promise<unknown> = Promise.resolve();
  const onProgress = (line: string) => {
    progress = progress.then(() => logEvent(id, "agent", "progress", line)).catch((err) => console.error(err));
  };
  try {
    const judgement = await verifyDeliverable(
      { title: gig.title, brief: gig.brief, criteria: gig.criteria, clarifications: gig.clarifications, submission },
      onProgress,
    );
    await progress;
    const release = computeRelease(gig.criteria, judgement.results);
    const verdict: Verdict = { ...judgement, releasePercent: release.percent, releaseWorking: release.working };
    if (!(await finishVerification(id, runId, verdict))) return; // interrupted, or superseded by a resubmission
    await logEvent(id, "agent", "verdict", `${decisionFor(verdict.releasePercent)} ${verdict.releasePercent}% (${verdict.confidence} confidence): ${verdict.summary}`);
    if (process.env.HOLDFAST_AUTO_RELEASE === "true" && verdict.releasePercent === 100 && verdict.confidence === "high") {
      await logEvent(id, "agent", "auto_release", "All criteria met with high confidence; releasing without waiting for the client");
      await settle(id, 100, "agent");
    }
  } catch (err) {
    await progress;
    if (await failVerification(id, runId)) await logEvent(id, "agent", "verification_failed", err instanceof Error ? err.message : String(err));
    else console.error(err);
  }
}

/** The client sends the work back for changes. The money stays held; nothing is charged. */
export async function requestChanges(id: string, note: string) {
  const gig = await mustGet(id);
  const text = note.trim();
  if (!text) throw new GigError("Say what needs to change");
  if (gig.status !== "verified") throw new GigError("This gig is not waiting for your review");
  if (gig.revisions >= MAX_REVISIONS) {
    throw new GigError(`No change requests left: you've used all ${MAX_REVISIONS}. Release a share, or 0% to get everything back.`);
  }
  if (!(await transition(id, "verified", "funded"))) throw new GigError("This gig is not waiting for your review");
  await updateGig(id, { revisions: gig.revisions + 1 });
  await logEvent(id, "client", "changes_requested", text.slice(0, 2000));
}

export async function settle(id: string, releasePercent: number, actor: "client" | "agent") {
  const gig = await mustGet(id);
  if (!gig.authorizationId) throw new GigError("Gig has no PayPal authorization");
  if (!(await transition(id, "verified", "settling"))) throw new GigError(`Gig is ${gig.status}, not ready to settle`);
  const plan = planSettlement(gig.amountCents, releasePercent);
  const agentPct = gig.verdict?.releasePercent;
  if (actor === "client" && agentPct !== undefined && agentPct !== releasePercent) {
    await logEvent(id, "client", "override", `Client chose ${releasePercent}% instead of the recommended ${agentPct}%`);
  }
  const fmt = (c: number) => formatMoney(c, gig.currency);
  const settlement = { releasePercent, captureCents: plan.captureCents, payoutCents: plan.payoutCents, feeCents: plan.feeCents, returnedCents: plan.returnedCents };
  let captured = false;
  try {
    if (plan.kind === "void") {
      await paypal.voidAuthorization(gig.authorizationId);
      await updateGig(id, { settlement });
      await logEvent(id, "paypal", "hold_voided", `${fmt(plan.returnedCents)} released back to the client`);
    } else {
      const note = `Holdfast: ${gig.title}. ${releasePercent}% of the agreed amount released after verification.`;
      const cap = await paypal.captureAuthorization(gig.authorizationId, plan.captureCents, gig.currency, note);
      captured = true;
      await updateGig(id, { captureId: cap.captureId, settlement });
      await logEvent(id, "paypal", "captured", `${fmt(plan.captureCents)} captured` + (plan.returnedCents ? `; ${fmt(plan.returnedCents)} returned to the client` : ""));
      await payFreelancer(gig, plan.captureCents, gig.verdict?.messageToFreelancer || note);
    }
    await transition(id, "settling", "settled");
  } catch (err) {
    // Nothing moved yet: let the client retry. Once funds are captured, a retry could double-capture,
    // so park it as failed; retryPayout only resends the payout.
    await transition(id, "settling", captured ? "failed" : "verified");
    await logEvent(id, "paypal", "settlement_failed", `${captured ? "Captured but payout failed" : "No funds moved; safe to retry"}: ${err}`);
    throw err;
  }
  return mustGet(id);
}

/** Pay the freelancer their share of a capture (minus the platform fee). */
async function payFreelancer(gig: Gig, capturedCents: number, note: string) {
  const { payoutCents, feeCents } = planSettlement(capturedCents, 100);
  const fmt = (c: number) => formatMoney(c, gig.currency);
  const payout = await paypal.payoutToFreelancer(gig.id, gig.freelancerEmail, payoutCents, gig.currency, note);
  await updateGig(gig.id, { payoutBatchId: payout.batchId });
  await logEvent(gig.id, "paypal", "payout_sent", `${fmt(payoutCents)} to ${gig.freelancerEmail} (fee ${fmt(feeCents)}), batch ${payout.batchId}`);
}

/**
 * Retry only the payout for a gig whose capture succeeded but payout failed.
 * Pays from the amount PayPal reports as captured, never captures again.
 */
export async function retryPayout(id: string) {
  const gig = await mustGet(id);
  if (!gig.captureId || gig.payoutBatchId) throw new GigError("This gig has no captured payment waiting to be paid out");
  if (!(await transition(id, "failed", "settling"))) throw new GigError(`Gig is ${gig.status}, not waiting for a payout retry`);
  try {
    const captured = await paypal.getCaptureCents(gig.captureId);
    await payFreelancer(gig, captured.cents, `Holdfast: ${gig.title}. Payment released after verification.`);
    await transition(id, "settling", "settled");
  } catch (err) {
    await transition(id, "settling", "failed");
    await logEvent(id, "paypal", "payout_retry_failed", String(err));
    throw err;
  }
  return mustGet(id);
}
