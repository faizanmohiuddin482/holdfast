"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { GigStatus } from "@/lib/db";

/** Keeps a gig page in sync with the other side's actions and live verification progress. */
export function StatusPoller({ token, status, progressCount }: { token: string; status: GigStatus; progressCount: number }) {
  const router = useRouter();
  const seen = useRef({ status, progressCount });

  useEffect(() => {
    seen.current = { status, progressCount };
  }, [status, progressCount]);

  useEffect(() => {
    if (status === "settled") return;
    const fast = status === "verifying" || status === "settling";
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/t/${token}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as { status: GigStatus; progress: string[] };
        if (next.status !== seen.current.status || next.progress.length !== seen.current.progressCount) router.refresh();
      } catch {
        // Offline for a moment: try again on the next tick.
      }
    }, fast ? 1500 : 4000);
    return () => clearInterval(timer);
  }, [token, status, router]);

  return null;
}
