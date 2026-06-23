import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { loadHub } from "@/lib/load-hub";
import { Hub } from "@/components/hub/hub";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

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

  // Archived events are hidden from the public, but the organizer may still view.
  if (result.archived && !result.data.isOrganizer) {
    return <ArchivedNotice />;
  }

  // The public hub is always read-only, even for the organizer.
  const data = { ...result.data, isOrganizer: false };
  return <Hub data={data} />;
}

function ArchivedNotice() {
  return (
    <div>
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/">
            <BrandMark />
          </Link>
        </div>
      </header>
      <main className="container grid place-items-center py-24 text-center">
        <div className="max-w-sm">
          <h1 className="text-2xl font-extrabold tracking-tight">
            This event has ended
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It has been archived by the organizer and is no longer publicly
            available.
          </p>
          <Button asChild className="mt-6">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
