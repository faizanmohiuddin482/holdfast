import { z } from "zod";
import { confirmCriteria } from "@/lib/escrow";
import { handleToken } from "@/lib/route";

export const runtime = "nodejs";
export const POST = handleToken("client", z.object({}), async (_b, gig) => {
  confirmCriteria(gig.id);
});
