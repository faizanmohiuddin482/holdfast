// Gig lifecycle: create -> fund (PayPal hold) -> submit -> agent verifies -> settle (capture/void + payout).
import { draftCriteria, verifyDeliverable } from "./agent";
import { createGig, getGig, logEvent, transition, updateGig, type Gig } from "./db";
import * as paypal from "./paypal";
import { decisionFor, formatMoney, planSettlement } from "./settle";

export class EscrowError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function mustGet(id: string): Gig {
  const gig = getGig(id);
  if (!gig) throw new EscrowError("Gig not found", 404);
  return gig;
}

export async function openGig(input: { title: string; brief: string; amountCents: number; currency: string; freelancerEmail: string }) {
  const { criteria, ambiguities } = await draftCriteria(input.title, input.brief);
  const gig = createGig({ ...input, criteria });
  logEvent(gig.id, "client", "gig_created", `${input.title}: ${formatMoney(input.amountCents, input.currency)}`);
  logEvent(gig.id, "agent", "criteria_drafted", `${criteria.length} acceptance criteria` + (ambiguities.length ? `; flagged: ${ambiguities.join(" | ")}` : ""));
  return gig;
}

export async function startFunding(id: string) {
  const gig = mustGet(id);
  if (gig.status !== "awaiting_funding") throw new EscrowError(`Gig is ${gig.status}, not awaiting funding`);
  const orderId = await paypal.createEscrowOrder(gig.id, gig.title, gig.amountCents, gig.currency);
  updateGig(id, { orderId });
  logEvent(id, "paypal", "order_created", orderId);
  return orderId;
}

export async function completeFunding(id: string, orderId: string) {
  const gig = mustGet(id);
  if (gig.orderId !== orderId) throw new EscrowError("Order does not belong to this gig");
  if (!transition(id, "awaiting_funding", "funded")) throw new EscrowError(`Gig is ${gig.status}, not awaiting funding`);
  try {
    const auth = await paypal.authorizeOrder(orderId);
    updateGig(id, { authorizationId: auth.authorizationId });
    logEvent(id, "paypal", "funds_held", `Authorization ${auth.authorizationId} (${auth.status})` + (auth.expiresAt ? `, valid until ${auth.expiresAt}` : ""));
  } catch (err) {
    transition(id, "funded", "awaiting_funding");
    throw err;
  }
}

export async function submitWork(id: string, submission: string) {
  const gig = mustGet(id);
  if (!transition(id, "funded", "verifying")) throw new EscrowError(`Gig is ${gig.status}; work can only be submitted once it's funded`);
  logEvent(id, "freelancer", "work_submitted", submission.slice(0, 500));
  try {
    const verdict = await verifyDeliverable({ title: gig.title, brief: gig.brief, criteria: gig.criteria, submission });
    updateGig(id, { verdict, status: "verified" });
    logEvent(id, "agent", "verdict", `${decisionFor(verdict.releasePercent)} ${verdict.releasePercent}% (${verdict.confidence} confidence): ${verdict.summary}`);
    if (process.env.HOLDFAST_AUTO_RELEASE === "true" && verdict.releasePercent === 100 && verdict.confidence === "high") {
      logEvent(id, "agent", "auto_release", "All criteria met with high confidence; releasing without waiting for the client");
      await settle(id, 100, "agent");
    }
  } catch (err) {
    transition(id, "verifying", "funded");
    logEvent(id, "agent", "verification_failed", String(err));
    throw err;
  }
  return mustGet(id);
}

export async function settle(id: string, releasePercent: number, actor: "client" | "agent") {
  const gig = mustGet(id);
  if (!gig.authorizationId) throw new EscrowError("Gig has no PayPal authorization");
  if (!transition(id, "verified", "settling")) throw new EscrowError(`Gig is ${gig.status}, not ready to settle`);
  const plan = planSettlement(gig.amountCents, releasePercent);
  const agentPct = gig.verdict?.releasePercent;
  if (actor === "client" && agentPct !== undefined && agentPct !== releasePercent) {
    logEvent(id, "client", "override", `Client chose ${releasePercent}% instead of the agent's ${agentPct}%`);
  }
  const fmt = (c: number) => formatMoney(c, gig.currency);
  let captured = false;
  try {
    if (plan.kind === "void") {
      await paypal.voidAuthorization(gig.authorizationId);
      logEvent(id, "paypal", "hold_voided", `${fmt(plan.returnedCents)} released back to the client`);
    } else {
      const note = `Holdfast: ${gig.title}. ${releasePercent}% of the agreed amount released after verification.`;
      const cap = await paypal.captureAuthorization(gig.authorizationId, plan.captureCents, gig.currency, note);
      captured = true;
      updateGig(id, { captureId: cap.captureId });
      logEvent(id, "paypal", "captured", `${fmt(plan.captureCents)} captured` + (plan.returnedCents ? `; ${fmt(plan.returnedCents)} returned to the client` : ""));
      await payFreelancer(gig, plan.captureCents, gig.verdict?.messageToFreelancer || note);
    }
    transition(id, "settling", "settled");
  } catch (err) {
    // Nothing moved yet: let the client retry. Once funds are captured, a retry could double-capture,
    // so park it as failed for manual payout follow-up.
    transition(id, "settling", captured ? "failed" : "verified");
    logEvent(id, "paypal", "settlement_failed", `${captured ? "Captured but payout failed" : "No funds moved; safe to retry"}: ${err}`);
    throw err;
  }
  return mustGet(id);
}

/** Pay the freelancer their share of a capture (minus the platform fee). */
async function payFreelancer(gig: Gig, capturedCents: number, note: string) {
  const { payoutCents, feeCents } = planSettlement(capturedCents, 100);
  const fmt = (c: number) => formatMoney(c, gig.currency);
  const payout = await paypal.payoutToFreelancer(gig.id, gig.freelancerEmail, payoutCents, gig.currency, note);
  updateGig(gig.id, { payoutBatchId: payout.batchId });
  logEvent(gig.id, "paypal", "payout_sent", `${fmt(payoutCents)} to ${gig.freelancerEmail} (fee ${fmt(feeCents)}), batch ${payout.batchId}`);
}

/**
 * Retry only the payout for a gig whose capture succeeded but payout failed.
 * Pays from the amount PayPal reports as captured, never captures again.
 */
export async function retryPayout(id: string) {
  const gig = mustGet(id);
  if (!gig.captureId || gig.payoutBatchId) throw new EscrowError("This gig has no captured payment waiting to be paid out");
  if (!transition(id, "failed", "settling")) throw new EscrowError(`Gig is ${gig.status}, not waiting for a payout retry`);
  try {
    const captured = await paypal.getCaptureCents(gig.captureId);
    await payFreelancer(gig, captured.cents, `Holdfast: ${gig.title}. Payment released after verification.`);
    transition(id, "settling", "settled");
  } catch (err) {
    transition(id, "settling", "failed");
    logEvent(id, "paypal", "payout_retry_failed", String(err));
    throw err;
  }
  return mustGet(id);
}
