import { z } from "zod";
import { completeFunding } from "@/lib/gigs";
import { handleToken } from "@/lib/route";

export const runtime = "nodejs";
export const POST = handleToken("client", z.object({ orderId: z.string().min(1) }), async (b, gig) => {
  await completeFunding(gig.id, b.orderId);
});
