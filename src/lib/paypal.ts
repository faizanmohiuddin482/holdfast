// Minimal PayPal REST client (sandbox by default). Only the calls Holdfast needs:
// Orders v2 (authorize = escrow hold), Payments v2 (capture / void), Payouts v1.
import { nanoid } from "nanoid";

const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError("oauth", res.status, await res.text());
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export class PayPalError extends Error {
  constructor(public op: string, public status: number, public body: string) {
    super(`PayPal ${op} failed (${status}): ${body.slice(0, 500)}`);
  }
}

async function call<T>(op: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      // Every money-moving call is idempotent: a retried request can't double-capture or double-pay.
      "PayPal-Request-Id": idempotencyKey ?? nanoid(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new PayPalError(op, res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

export const money = (cents: number, currency: string) => ({
  currency_code: currency,
  value: (cents / 100).toFixed(2),
});

/** Create an order with intent AUTHORIZE: the buyer approves, funds are held, nothing is captured yet. */
export async function createEscrowOrder(gigId: string, title: string, cents: number, currency: string) {
  const order = await call<{ id: string }>("create order", "/v2/checkout/orders", {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: gigId,
        description: `Holdfast escrow: ${title}`.slice(0, 127),
        custom_id: gigId,
        amount: money(cents, currency),
      },
    ],
  }, `order-${gigId}`);
  return order.id;
}

type AuthorizeResponse = {
  status: string;
  purchase_units: { payments?: { authorizations?: { id: string; status: string; expiration_time?: string }[] } }[];
};

export async function authorizeOrder(orderId: string) {
  const res = await call<AuthorizeResponse>("authorize order", `/v2/checkout/orders/${orderId}/authorize`, undefined, `auth-${orderId}`);
  const auth = res.purchase_units[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error(`Order ${orderId} authorized but no authorization returned`);
  return { authorizationId: auth.id, status: auth.status, expiresAt: auth.expiration_time ?? null };
}

/** Capture part or all of the hold. final_capture closes the authorization, releasing any remainder to the buyer. */
export async function captureAuthorization(authorizationId: string, cents: number, currency: string, note: string) {
  const res = await call<{ id: string; status: string }>(
    "capture",
    `/v2/payments/authorizations/${authorizationId}/capture`,
    { amount: money(cents, currency), final_capture: true, note_to_payer: note.slice(0, 255) },
    // Amount is part of the key: a retry at a different amount must not get an earlier capture replayed back.
    `capture-${authorizationId}-${cents}`,
  );
  return { captureId: res.id, status: res.status };
}

export async function voidAuthorization(authorizationId: string) {
  await call("void", `/v2/payments/authorizations/${authorizationId}/void`, undefined, `void-${authorizationId}`);
}

export async function payoutToFreelancer(gigId: string, email: string, cents: number, currency: string, note: string) {
  const res = await call<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
    "payout",
    "/v1/payments/payouts",
    {
      sender_batch_header: {
        sender_batch_id: `holdfast-${gigId}`,
        email_subject: "You've been paid through Holdfast",
        email_message: note.slice(0, 1000),
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: email,
          // Payouts v1 spells it `currency`, unlike Orders/Payments v2 (`currency_code`).
          amount: { value: (cents / 100).toFixed(2), currency },
          note: note.slice(0, 4000),
          sender_item_id: gigId,
        },
      ],
    },
    // No fixed request id: PayPal itself rejects a reused sender_batch_id, which is what stops a double payout,
    // and a fresh id lets a corrected request through after a validation failure.
  );
  return { batchId: res.batch_header.payout_batch_id, status: res.batch_header.batch_status };
}

/** What PayPal actually captured, so a payout retry pays from the real captured amount. */
export async function getCaptureCents(captureId: string): Promise<{ cents: number; currency: string }> {
  const res = await fetch(`${BASE}/v2/payments/captures/${captureId}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  const text = await res.text();
  if (!res.ok) throw new PayPalError("get capture", res.status, text);
  const { amount } = JSON.parse(text) as { amount: { value: string; currency_code: string } };
  return { cents: Math.round(Number(amount.value) * 100), currency: amount.currency_code };
}
