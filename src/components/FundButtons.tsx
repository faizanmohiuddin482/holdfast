"use client";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./api";

export function FundButtons({ token, currency, clientId }: { token: string; currency: string; clientId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="max-w-sm space-y-2">
      <PayPalScriptProvider options={{ clientId, intent: "authorize", currency }}>
        <PayPalButtons
          style={{ layout: "vertical", shape: "rect", color: "gold", label: "pay" }}
          createOrder={async () => (await post<{ orderId: string }>(`/api/t/${token}/order`)).orderId}
          onApprove={async ({ orderID }) => {
            await post(`/api/t/${token}/authorize`, { orderId: orderID });
            router.refresh();
          }}
          onError={(err) => setError(err instanceof Error ? err.message : String(err))}
        />
      </PayPalScriptProvider>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
