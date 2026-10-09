import { z } from "zod";
import { requestChanges } from "@/lib/escrow";
import { handleToken } from "@/lib/route";

export const runtime = "nodejs";
export const POST = handleToken("client", z.object({ note: z.string().max(2000) }), async (b, gig) => {
  requestChanges(gig.id, b.note);
});
