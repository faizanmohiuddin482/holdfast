import { z } from "zod";
import { settle } from "@/lib/escrow";
import { handle } from "@/lib/route";

export const runtime = "nodejs";
export const POST = handle(z.object({ releasePercent: z.number().int().min(0).max(100) }), async (b, id) => {
  await settle(id, b.releasePercent, "client");
});
