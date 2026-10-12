import { NextResponse } from "next/server";
import { z } from "zod";
import type { Gig, Role } from "./db";
import { GigError, lookup } from "./gigs";
import { PayPalError } from "./paypal";

export type TokenCtx = { params: Promise<{ token: string }> };

function fail(err: unknown) {
  console.error(err);
  if (err instanceof GigError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof PayPalError) return NextResponse.json({ error: err.message }, { status: 502 });
  return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
}

async function parse<T>(req: Request, schema: z.ZodType<T>) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  return parsed.success ? { data: parsed.data } : { error: NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 }) };
}

/** For routes without a token, e.g. POST /api/gigs. */
export function handle<T>(schema: z.ZodType<T>, fn: (body: T) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      const body = await parse(req, schema);
      if ("error" in body) return body.error;
      return NextResponse.json((await fn(body.data)) ?? { ok: true });
    } catch (err) {
      return fail(err);
    }
  };
}

/** For /api/t/[token]/…: resolves the token and enforces which role may call the action. */
export function handleToken<T>(role: Role | "any", schema: z.ZodType<T>, fn: (body: T, gig: Gig, role: Role, req: Request) => Promise<unknown>) {
  return async (req: Request, ctx: TokenCtx) => {
    try {
      const found = await lookup((await ctx.params).token);
      if (!found) return NextResponse.json({ error: "Gig not found" }, { status: 404 });
      if (role !== "any" && found.role !== role) {
        return NextResponse.json({ error: `Only the ${role} can do this` }, { status: 403 });
      }
      const body = req.method === "GET" ? { data: undefined as T } : await parse(req, schema);
      if ("error" in body) return body.error;
      return NextResponse.json((await fn(body.data, found.gig, found.role, req)) ?? { ok: true });
    } catch (err) {
      return fail(err);
    }
  };
}
