import { NextResponse } from "next/server";
import { z } from "zod";
import { EscrowError } from "./escrow";
import { PayPalError } from "./paypal";

export type Ctx = { params: Promise<{ id?: string }> };

export function handle<T>(schema: z.ZodType<T>, fn: (body: T, id: string) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const parsed = schema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
      const { id } = await ctx.params;
      return NextResponse.json((await fn(parsed.data, id ?? "")) ?? { ok: true });
    } catch (err) {
      console.error(err);
      if (err instanceof EscrowError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof PayPalError) return NextResponse.json({ error: err.message }, { status: 502 });
      return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
    }
  };
}
