import { z } from "zod";
import { startFunding } from "@/lib/gigs";
import { handleToken } from "@/lib/route";

export const runtime = "nodejs";
export const POST = handleToken("client", z.object({}), async (_b, gig) => ({ orderId: await startFunding(gig.id) }));
