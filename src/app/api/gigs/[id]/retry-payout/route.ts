import { z } from "zod";
import { retryPayout } from "@/lib/escrow";
import { handle } from "@/lib/route";

export const runtime = "nodejs";
export const POST = handle(z.object({}), async (_b, id) => {
  await retryPayout(id);
});
