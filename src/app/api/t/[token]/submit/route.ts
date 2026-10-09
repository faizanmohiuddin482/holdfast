import { z } from "zod";
import { submitWork } from "@/lib/escrow";
import { handleToken } from "@/lib/route";

export const runtime = "nodejs";
export const POST = handleToken("freelancer", z.object({ submission: z.string().trim().min(10).max(20_000) }), async (b, gig) => {
  await submitWork(gig.id, b.submission);
});
