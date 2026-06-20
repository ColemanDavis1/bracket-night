import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ExternalLink, Calendar, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/brand";
import { signOut } from "@/lib/actions/tournaments";
import { FORMAT_LABELS } from "@/lib/labels";
import type { TournamentRow } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*, players(count)")
    .eq("organizer_id", user.id)
    .order("created_at", { ascending: false });

  const rows = (tournaments ?? []) as (TournamentRow & {
    players: { count: number }[];
  })[];
  const active = rows.filter((t) => t.status !== "complete");
  const past = rows.filter((t) => t.status === "complete");

  return (
    <div>
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/">
            <BrandMark />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <form action={signOut}>
              <Button variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Your tournaments
            </h1>
            <p className="text-sm text-muted-foreground">
              Create an event, run the bracket, and share the live hub.
            </p>
          </div>
          <Button asChild>
            <Link href="/new">
              <Plus /> New tournament
            </Link>
          </Button>
        </div>

        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            <Section title="Active" tournaments={active} />
            {past.length > 0 ? <Section title="Past" tournaments={past} /> : null}
          </div>
        )}
      </main>
    </div>
  );
}

function Section({
  title,
  tournaments,
}: {
  title: string;
  tournaments: (TournamentRow & { players: { count: number }[] })[];
}) {
  if (tournaments.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tournaments.map((t) => (
          <Link
            key={t.id}
            href={`/t/${t.slug}/manage`}
            className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/60"
          >
            <div className="flex items-start justify-between">
              <h3 className="font-bold leading-tight">{t.name}</h3>
              <StatusBadge status={t.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.game_name || "Game night"} ·{" "}
              {FORMAT_LABELS[t.format] ?? t.format}
            </p>
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {t.players?.[0]?.count ?? 0} players
              </span>
              {t.event_date ? (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(t.event_date).toLocaleDateString()}
                </span>
              ) : null}
              <span className="ml-auto inline-flex items-center gap-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Open <ExternalLink className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: TournamentRow["status"] }) {
  if (status === "complete") return <Badge variant="gold">Final</Badge>;
  if (status === "live") return <Badge>Live</Badge>;
  return <Badge variant="muted">Setup</Badge>;
}

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border py-20 text-center">
      <div className="max-w-sm">
        <h3 className="text-lg font-bold">No tournaments yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Spin up your first bracket in under a minute. You can add 2–32 players
          and pick any format.
        </p>
        <Button asChild className="mt-5">
          <Link href="/new">
            <Plus /> Create your first tournament
          </Link>
        </Button>
      </div>
    </div>
  );
}
