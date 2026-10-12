import { z } from "zod";
import { settle } from "@/lib/gigs";
import { handleToken } from "@/lib/route";

export const runtime = "nodejs";
export const POST = handleToken("client", z.object({ releasePercent: z.number().int().min(0).max(100) }), async (b, gig) => {
  await settle(gig.id, b.releasePercent, "client");
});
