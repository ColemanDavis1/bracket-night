import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadHub } from "@/lib/load-hub";
import { Hub } from "@/components/hub/hub";

export const dynamic = "force-dynamic";

export default async function ManageHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await loadHub(slug);
  if (!result) notFound();
  // The owner plus anyone they invited. loadHub resolves the role (by account or
  // by the email the invite was sent to); no role means no manage view.
  if (result.data.viewerRole === null) redirect(`/t/${slug}`);

  // Don't force isOrganizer here: the role decides which tabs appear, so a
  // scorekeeper sees the scoring surfaces and not the settings.
  return <Hub data={result.data} />;
}
