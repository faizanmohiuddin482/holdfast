import { z } from "zod";
import { listProgress } from "@/lib/db";
import { handleToken } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleToken("any", z.unknown(), async (_b, gig) => ({ status: gig.status, progress: listProgress(gig.id) }));
