import { z } from "zod";
import { completeFunding } from "@/lib/escrow";
import { handle } from "@/lib/route";

export const runtime = "nodejs";
export const POST = handle(z.object({ orderId: z.string().min(1) }), (b, id) => completeFunding(id, b.orderId));
