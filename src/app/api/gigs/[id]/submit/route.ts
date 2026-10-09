import { z } from "zod";
import { submitWork } from "@/lib/escrow";
import { handle } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = handle(z.object({ submission: z.string().trim().min(10).max(20_000) }), async (b, id) => {
  await submitWork(id, b.submission);
});
