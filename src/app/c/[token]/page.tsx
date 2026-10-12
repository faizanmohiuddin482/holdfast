import { notFound } from "next/navigation";
import { GigView } from "@/components/gig/GigView";
import { lookup } from "@/lib/gigs";

export const dynamic = "force-dynamic";

export default async function ClientGigPage({ params }: { params: Promise<{ token: string }> }) {
  const found = await lookup((await params).token);
  if (!found || found.role !== "client") notFound();
  return <GigView gig={found.gig} role="client" />;
}
