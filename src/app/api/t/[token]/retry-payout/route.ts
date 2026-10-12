import { z } from "zod";
import { retryPayout } from "@/lib/gigs";
import { handleToken } from "@/lib/route";

export const runtime = "nodejs";
export const POST = handleToken("client", z.object({}), async (_b, gig) => {
  await retryPayout(gig.id);
});
