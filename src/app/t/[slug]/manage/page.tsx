import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadHub } from "@/lib/load-hub";
import { Hub } from "@/components/hub/hub";
import { BrandMark } from "@/components/brand";

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

  // The owner plus anyone they invited. Say so rather than redirecting silently:
  // the usual cause is being signed in under a different address than the one
  // invited, and only the person looking at the screen can see both.
  if (result.data.viewerRole === null) {
    return (
      <div>
        <header className="border-b border-border">
          <div className="container flex items-center justify-between py-4">
            <Link href="/">
              <BrandMark />
            </Link>
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Dashboard
            </Link>
          </div>
        </header>

        <main className="container max-w-md py-12">
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
            <h1 className="mt-3 text-lg font-bold">
              You don&apos;t have access to this event
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You&apos;re signed in as{" "}
              <span className="font-medium text-foreground">{user.email}</span>.
              Access is granted per email address, so ask the organizer to invite
              exactly that address — or sign out and sign back in with the one
              they invited.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Link
                href={`/t/${slug}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                View the public event page →
              </Link>
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Sign in with a different address
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Don't force isOrganizer here: the role decides which tabs appear, so a
  // scorekeeper sees the scoring surfaces and not the settings.
  return <Hub data={result.data} />;
}
