import { z } from "zod";
import { saveDraft } from "@/lib/gigs";
import { handleToken } from "@/lib/route";

export const runtime = "nodejs";
const Body = z.object({
  criteria: z.array(z.object({ text: z.string().max(500), weight: z.number().int().min(1).max(5) })).max(12),
  clarifications: z.array(z.object({ question: z.string().max(1000), answer: z.string().max(1000) })).max(12),
});
export const POST = handleToken("client", Body, async (b, gig) => {
  await saveDraft(gig.id, b);
});
