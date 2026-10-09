import { listEvents, listProgress, type Gig, type Role } from "@/lib/db";
import { ActivityLog } from "./ActivityLog";
import { CriteriaCard } from "./CriteriaCard";
import { MoneyTracker } from "./MoneyTracker";
import { NextStep } from "./NextStep";
import { RoleHeader } from "./RoleHeader";
import { StatusPoller } from "./StatusPoller";
import { VerdictCard } from "./VerdictCard";

export function GigView({ gig, role }: { gig: Gig; role: Role }) {
  const token = role === "client" ? gig.clientToken : gig.freelancerToken;
  const progress = listProgress(gig.id);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <RoleHeader gig={gig} role={role} />
      <MoneyTracker gig={gig} role={role} />
      <NextStep gig={gig} role={role} token={token} progress={progress} />
      {gig.verdict && gig.status !== "verifying" && <VerdictCard gig={gig} role={role} />}
      {gig.status !== "draft" && <CriteriaCard gig={gig} />}
      <ActivityLog events={listEvents(gig.id)} />
      <StatusPoller token={token} status={gig.status} progressCount={progress.length} />
    </div>
  );
}
