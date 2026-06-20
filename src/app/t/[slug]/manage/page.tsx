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
  if (result.organizerId !== user.id) redirect(`/t/${slug}`);

  return <Hub data={{ ...result.data, isOrganizer: true }} />;
}
