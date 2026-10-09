import { notFound } from "next/navigation";
import { GigView } from "@/components/gig/GigView";
import { lookup } from "@/lib/escrow";

export const dynamic = "force-dynamic";

export default async function FreelancerGigPage({ params }: { params: Promise<{ token: string }> }) {
  const found = lookup((await params).token);
  if (!found || found.role !== "freelancer") notFound();
  return <GigView gig={found.gig} role="freelancer" />;
}
