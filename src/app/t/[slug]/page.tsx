import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadHub } from "@/lib/load-hub";
import { Hub } from "@/components/hub/hub";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadHub(slug);
  if (!result) return { title: "Tournament" };
  return {
    title: result.data.tournament.name,
    description: `Live standings, schedule, and analysis for ${result.data.tournament.name}.`,
  };
}

export default async function PublicHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await loadHub(slug);
  if (!result) notFound();

  // The public hub is always read-only, even for the organizer.
  const data = { ...result.data, isOrganizer: false };
  return <Hub data={data} />;
}
