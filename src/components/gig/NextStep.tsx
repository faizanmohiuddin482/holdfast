import type { Gig, Role } from "@/lib/db";
import { MAX_REVISIONS } from "@/lib/escrow";
import { PLATFORM_FEE_BPS } from "@/lib/settle";
import { RequestChanges } from "../RequestChanges";
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

function ChangeNote({ note, gig }: { note: string; gig: Gig }) {
  const short = gig.verdict?.results.filter((r) => r.status !== "met") ?? [];
  const textOf = (id: string) => gig.criteria.find((c) => c.id === id)?.text ?? id;
  return (
    <div className="mb-4 space-y-2 rounded-lg bg-primary-soft p-4 text-sm">
      <p className="font-semibold text-primary">The client asked for changes</p>
      <p className="whitespace-pre-wrap text-ink">{note}</p>
      {short.length > 0 && (
        <div>
          <p className="mt-2 text-xs font-semibold text-ink-2">Items that fell short last time</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-2">
            {short.map((r) => <li key={r.criterionId}>{textOf(r.criterionId)}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Pre-fills the client's change request from the AI's findings. */
function suggestedChanges(gig: Gig) {
  const v = gig.verdict;
  if (!v) return "";
  const short = v.results.filter((r) => r.status !== "met").map((r) => `- ${gig.criteria.find((c) => c.id === r.criterionId)?.text ?? r.criterionId}`);
  return [v.messageToFreelancer, short.length ? `Still needed:\n${short.join("\n")}` : ""].filter(Boolean).join("\n\n");
}

export function NextStep({ gig, role, token, progress, problem, changeRequest }: {
  gig: Gig; role: Role; token: string; progress: string[]; problem: string | null; changeRequest: string | null;
}) {
  const client = role === "client";
  const round = `round ${gig.revisions + 1} of ${MAX_REVISIONS + 1}`;
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

  switch (gig.status) {
    case "draft":
      return client ? (
        <Step mine title={`Check the checklist (${gig.criteria.length} items)`}>
          <p className="mb-4 text-sm text-ink-2">The AI turned your brief into items it can check. Edit anything that&apos;s off; this is what the work will be judged against.</p>
          <CriteriaEditor token={token} criteria={gig.criteria} clarifications={gig.clarifications} />
        </Step>
      ) : (
        <Step mine={false} title="The client is still setting up this gig"><Wait>You&apos;ll be able to start once they&apos;ve agreed the checklist and PayPal is holding the payment.</Wait></Step>
      );
    case "awaiting_funding":
      return client ? (
        <Step mine title="Approve the payment hold">
          <p className="mb-4 text-sm text-ink-2">PayPal holds the money. You aren&apos;t charged until you approve the work, and you only pay for what was delivered.</p>
          {clientId ? <FundButtons token={token} currency={gig.currency} clientId={clientId} /> : <p className="text-sm text-danger">PayPal isn&apos;t configured (NEXT_PUBLIC_PAYPAL_CLIENT_ID).</p>}
        </Step>
      ) : (
        <Step mine={false} title="Waiting for the client to pay"><Wait>Don&apos;t start work yet. This page updates as soon as the money is held.</Wait></Step>
      );
    case "funded":
      if (changeRequest) {
        return client ? (
          <Step mine={false} title={`Waiting for the revised work (${round})`}>
            {problem && <Problem text={problem} client />}
            <ChangeNote note={changeRequest} gig={gig} />
            <p className="mb-4 text-sm text-ink-2">Your money stays held. When they resubmit, the AI checks the revised work and you review it again.</p>
            <InvitePanel path={`/f/${gig.freelancerToken}`} />
          </Step>
        ) : (
          <Step mine title={`Changes requested (${round})`}>
            {problem && <Problem text={problem} client={false} />}
            <ChangeNote note={changeRequest} gig={gig} />
            <p className="mb-4 text-sm text-ink-2">The money is still held for you. Make the changes, then resubmit; the AI checks the revised work against the same checklist.</p>
            <SubmitWorkForm token={token} revised />
          </Step>
        );
      }
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
        <Step mine title={gig.revisions > 0 ? `Review the revised work (${round})` : "Review and release"}>
          <div className="space-y-4">
            <SettlePanel token={token} amountCents={gig.amountCents} currency={gig.currency} recommendedPercent={gig.verdict?.releasePercent ?? 0} feeBps={PLATFORM_FEE_BPS} />
            {gig.revisions < MAX_REVISIONS ? (
              <RequestChanges token={token} suggested={suggestedChanges(gig)} left={MAX_REVISIONS - gig.revisions} total={MAX_REVISIONS} />
            ) : (
              <p className="border-t border-line pt-4 text-xs text-muted">You&apos;ve used all your change requests. Release a share, or 0% to get everything back.</p>
            )}
          </div>
        </Step>
      ) : (
        <Step mine={false} title="The client is reviewing the AI's verdict">
          <Wait>
            They can release the recommended {gig.verdict?.releasePercent ?? 0}%, adjust it
            {gig.revisions < MAX_REVISIONS ? ", or ask you for changes" : ""}. You&apos;ll see the result here.
          </Wait>
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
