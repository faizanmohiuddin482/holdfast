import type { Gig, Role } from "@/lib/db";
import { PLATFORM_FEE_BPS } from "@/lib/settle";
import { FundButtons } from "../FundButtons";
import { RetryPayout } from "../RetryPayout";
import { SettlePanel } from "../SettlePanel";
import { SubmitWorkForm } from "../SubmitWorkForm";
import { CriteriaEditor } from "./CriteriaEditor";
import { InvitePanel } from "./InvitePanel";
import { ProgressList } from "./ProgressList";

function Step({ title, mine, children }: { title: string; mine: boolean; children: React.ReactNode }) {
  return (
    <section className={`card ${mine ? "border-l-4 border-l-primary" : ""}`} aria-labelledby="next-step">
      <p className={`text-xs font-semibold ${mine ? "text-primary" : "text-muted"}`}>{mine ? "Your next step" : "Nothing to do right now"}</p>
      <h2 id="next-step" className="mt-1 text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Wait = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-ink-2">{children}</p>;

const Problem = ({ text, client }: { text: string; client: boolean }) => (
  <p className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
    The last check didn&apos;t finish: {text} {client ? "The freelancer has been asked to submit again." : ""}
  </p>
);

export function NextStep({ gig, role, token, progress, problem }: { gig: Gig; role: Role; token: string; progress: string[]; problem: string | null }) {
  const client = role === "client";
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

  switch (gig.status) {
    case "draft":
      return client ? (
        <Step mine title={`Check the checklist (${gig.criteria.length} items)`}>
          <p className="mb-4 text-sm text-ink-2">The AI turned your brief into items it can check. Edit anything that&apos;s off; this is what the work will be judged against.</p>
          <CriteriaEditor token={token} criteria={gig.criteria} clarifications={gig.clarifications} />
        </Step>
      ) : (
        <Step mine={false} title="The client is still setting up this gig"><Wait>You&apos;ll be able to start once they&apos;ve agreed the checklist and paid into escrow.</Wait></Step>
      );
    case "awaiting_funding":
      return client ? (
        <Step mine title="Pay into escrow">
          <p className="mb-4 text-sm text-ink-2">PayPal holds the money. You aren&apos;t charged until you approve the work, and you only pay for what was delivered.</p>
          {clientId ? <FundButtons token={token} currency={gig.currency} clientId={clientId} /> : <p className="text-sm text-danger">PayPal isn&apos;t configured (NEXT_PUBLIC_PAYPAL_CLIENT_ID).</p>}
        </Step>
      ) : (
        <Step mine={false} title="Waiting for the client to pay"><Wait>Don&apos;t start work yet. This page updates as soon as the money is held.</Wait></Step>
      );
    case "funded":
      return client ? (
        <Step mine title="Invite your freelancer">
          {problem && <Problem text={problem} client />}
          <p className="mb-4 text-sm text-ink-2">Send them this link. They&apos;ll see the checklist, that the money is held, and where to submit the work.</p>
          <InvitePanel path={`/f/${gig.freelancerToken}`} />
        </Step>
      ) : (
        <Step mine title="Submit your work">
          {problem && <Problem text={problem} client={false} />}
          <p className="mb-4 text-sm text-ink-2">The money is held, so you can start. When you submit, the AI checks your work against the checklist below.</p>
          <SubmitWorkForm token={token} />
        </Step>
      );
    case "verifying":
      return (
        <Step mine={false} title={client ? "The AI is checking the work" : "The AI is checking your work"}>
          <ProgressList lines={progress} running />
        </Step>
      );
    case "verified":
      return client ? (
        <Step mine title="Review and release">
          <SettlePanel token={token} amountCents={gig.amountCents} currency={gig.currency} recommendedPercent={gig.verdict?.releasePercent ?? 0} feeBps={PLATFORM_FEE_BPS} />
        </Step>
      ) : (
        <Step mine={false} title="The client is reviewing the AI's verdict">
          <Wait>They can release the recommended {gig.verdict?.releasePercent ?? 0}% or adjust it. You&apos;ll see the payment here.</Wait>
        </Step>
      );
    case "settling":
      return <Step mine={false} title={client ? "Sending the payment" : "Your payment is on its way"}><ProgressList lines={[]} running /></Step>;
    case "failed":
      return client ? (
        <Step mine title="The payout needs a retry"><RetryPayout token={token} /></Step>
      ) : (
        <Step mine={false} title="Your payout is delayed"><Wait>The payment was approved, but sending it failed. The client has been asked to retry.</Wait></Step>
      );
    case "settled":
      return (
        <Step mine={false} title="All done">
          <Wait>{client ? "This gig is complete. The money tracker above shows where everything went." : "This gig is complete. PayPal will email you about the payment."}</Wait>
        </Step>
      );
  }
}
