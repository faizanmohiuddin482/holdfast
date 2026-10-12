import { z } from "zod";
import { listEvents, listProgress } from "@/lib/db";
import { handleToken } from "@/lib/route";
import { gigView } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Default: the light payload the gig pages poll. ?view=full: the role-safe view for API clients and agents.
export const GET = handleToken("any", z.unknown(), async (_b, gig, role, req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("view") !== "full") return { status: gig.status, progress: await listProgress(gig.id) };
  return gigView(gig, role, await listEvents(gig.id), await listProgress(gig.id), process.env.HOLDFAST_PUBLIC_URL ?? url.origin);
});
