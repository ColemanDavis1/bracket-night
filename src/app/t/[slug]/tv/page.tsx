import { notFound } from "next/navigation";
import { loadHub } from "@/lib/load-hub";
import { TvShow } from "@/components/hub/tv-show";

export const dynamic = "force-dynamic";

export default async function TvPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await loadHub(slug);
  if (!result) notFound();
  return <TvShow data={{ ...result.data, isOrganizer: false }} />;
}
