// Where the gig's money is right now, described from the viewer's side.
import type { Gig, Role } from "./db";
import { formatMoney } from "./settle";

export type MoneyNode = { key: "source" | "held" | "freelancer" | "returned"; label: string; cents: number; active: boolean };

const labels: Record<Role, Record<MoneyNode["key"], string>> = {
  client: { source: "Your PayPal", held: "Held by PayPal", freelancer: "Freelancer", returned: "Back to you" },
  freelancer: { source: "Client's PayPal", held: "Held by PayPal", freelancer: "You", returned: "Back to client" },
};

export function moneyState(gig: Pick<Gig, "status" | "amountCents" | "currency" | "settlement">, role: Role) {
  const fmt = (c: number) => formatMoney(c, gig.currency);
  const st = gig.settlement;
  const cents = { source: 0, held: 0, freelancer: 0, returned: 0 };
  let activeKeys: MoneyNode["key"][];
  let sentence: string;

  switch (gig.status) {
    case "draft":
    case "awaiting_funding":
      cents.source = gig.amountCents;
      activeKeys = ["source"];
      sentence =
        role === "client"
          ? gig.status === "draft"
            ? "Nothing is charged yet. Confirm the criteria, then pay into escrow."
            : "Nothing is charged yet. When you pay, PayPal holds the money until you approve."
          : "The client hasn't funded this gig yet. Don't start work until the money is held.";
      break;
    case "funded":
    case "verifying":
    case "verified":
      cents.held = gig.amountCents;
      activeKeys = ["held"];
      sentence =
        role === "client"
          ? `Your ${fmt(gig.amountCents)} is held by PayPal. You haven't been charged, and nothing moves until you approve.`
          : `The client's ${fmt(gig.amountCents)} is held by PayPal. You'll be paid when the work is approved.`;
      break;
    case "settling":
      cents.held = gig.amountCents;
      activeKeys = ["held"];
      sentence = role === "client" ? "Sending the payment now." : "Your payment is being sent.";
      break;
    case "failed":
      cents.held = st?.captureCents ?? 0;
      cents.returned = st?.returnedCents ?? 0;
      activeKeys = ["held"];
      sentence =
        role === "client"
          ? `You were charged ${fmt(st?.captureCents ?? 0)}. The payout to the freelancer didn't go through yet.`
          : `${fmt(st?.payoutCents ?? 0)} is approved for you, but the payout is delayed. The client has been asked to retry.`;
      break;
    case "settled": {
      cents.freelancer = st?.payoutCents ?? 0;
      cents.returned = st?.returnedCents ?? 0;
      activeKeys = (["freelancer", "returned"] as const).filter((k) => cents[k] > 0);
      if (!st || st.captureCents === 0) {
        sentence =
          role === "client"
            ? `You weren't charged. The full ${fmt(gig.amountCents)} hold went back to your PayPal.`
            : "This gig closed without a payment. The hold went back to the client.";
      } else {
        sentence =
          role === "client"
            ? `You were charged ${fmt(st.captureCents)}.` + (st.returnedCents ? ` ${fmt(st.returnedCents)} went back to your PayPal.` : "")
            : `You received ${fmt(st.payoutCents)} (${fmt(st.captureCents)} minus a ${fmt(st.feeCents)} fee).`;
      }
      break;
    }
  }

  const nodes: MoneyNode[] = (["source", "held", "freelancer", "returned"] as const).map((key) => ({
    key,
    label: labels[role][key],
    cents: cents[key],
    active: activeKeys.includes(key),
  }));
  return { nodes, sentence };
}
