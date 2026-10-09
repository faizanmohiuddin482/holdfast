import { z } from "zod";
import { openGig } from "@/lib/escrow";
import { handle } from "@/lib/route";

export const runtime = "nodejs";

const Body = z.object({
  title: z.string().trim().min(3).max(120),
  brief: z.string().trim().min(20).max(8000),
  amount: z.coerce.number().positive().max(10_000),
  currency: z.string().length(3).default("USD"),
  freelancerEmail: z.email(),
});

export const POST = handle(Body, async (b) => {
  const gig = await openGig({ ...b, amountCents: Math.round(b.amount * 100) });
  return { clientToken: gig.clientToken };
});
