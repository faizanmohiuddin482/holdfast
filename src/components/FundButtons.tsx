"use client";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./api";

export function FundButtons({ gigId, currency, clientId }: { gigId: string; currency: string; clientId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <PayPalScriptProvider options={{ clientId, intent: "authorize", currency }}>
        <PayPalButtons
          style={{ layout: "vertical", shape: "rect", label: "pay" }}
          createOrder={async () => (await post<{ orderId: string }>(`/api/gigs/${gigId}/order`)).orderId}
          onApprove={async ({ orderID }) => {
            await post(`/api/gigs/${gigId}/authorize`, { orderId: orderID });
            router.refresh();
          }}
          onError={(err) => setError(err instanceof Error ? err.message : String(err))}
        />
      </PayPalScriptProvider>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
