import { z } from "zod";
import { startFunding } from "@/lib/escrow";
import { handle } from "@/lib/route";

export const runtime = "nodejs";
export const POST = handle(z.object({}), async (_b, id) => ({ orderId: await startFunding(id) }));
