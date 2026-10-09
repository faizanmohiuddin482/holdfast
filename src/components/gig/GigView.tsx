import { listEvents, listProgress, type Gig, type Role } from "@/lib/db";
import { latestChangeRequest, verificationProblem } from "@/lib/events";
import { ActivityLog } from "./ActivityLog";
import { CriteriaCard } from "./CriteriaCard";
import { MoneyTracker } from "./MoneyTracker";
import { NextStep } from "./NextStep";
import { RoleHeader } from "./RoleHeader";
import { StatusPoller } from "./StatusPoller";
import { VerdictCard } from "./VerdictCard";

export async function GigView({ gig, role }: { gig: Gig; role: Role }) {
  const token = role === "client" ? gig.clientToken : gig.freelancerToken;
  const progress = await listProgress(gig.id);
  const events = await listEvents(gig.id);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <RoleHeader gig={gig} role={role} />
      <MoneyTracker gig={gig} role={role} />
      <NextStep gig={gig} role={role} token={token} progress={progress} problem={gig.status === "funded" ? verificationProblem(events) : null}
        changeRequest={gig.status === "funded" ? latestChangeRequest(events) : null} />
      {gig.verdict && gig.status !== "verifying" && <VerdictCard gig={gig} role={role} />}
      {gig.status !== "draft" && <CriteriaCard gig={gig} />}
      <ActivityLog events={events} />
      <StatusPoller token={token} status={gig.status} progressCount={progress.length} />
    </div>
  );
}
