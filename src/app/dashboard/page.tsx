import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand";
import { signOut } from "@/lib/actions/tournaments";
import {
  TournamentCard,
  type DashboardTournament,
} from "@/components/dashboard/tournament-card";
import { BulkDeletePast } from "@/components/dashboard/bulk-delete-past";
import { isAdminRole, ROLE_LABELS } from "@/lib/access/roles";

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

  // Events someone else invited me to help run. RLS returns only my own rows.
  const { data: myAdminRows } = await supabase
    .from("tournament_admins")
    .select("tournament_id, role");
  const sharedRoles = new Map(
    ((myAdminRows ?? []) as { tournament_id: string; role: string }[]).map((a) => [
      a.tournament_id,
      a.role,
    ]),
  );
  const { data: sharedTournaments } = sharedRoles.size
    ? await supabase
        .from("tournaments")
        .select("id, name, slug, game_name, status")
        .in("id", [...sharedRoles.keys()])
        .is("archived_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };
  const shared = ((sharedTournaments ?? []) as {
    id: string;
    name: string;
    slug: string;
    game_name: string | null;
    status: string;
  }[]).filter((t) => isAdminRole(sharedRoles.get(t.id)));

  const rows = (tournaments ?? []) as DashboardTournament[];
  const archived = rows.filter((t) => t.archived_at != null);
  const live = rows.filter((t) => t.archived_at == null);
  const active = live.filter((t) => t.status !== "complete");
  const past = live.filter((t) => t.status === "complete");

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

            {shared.length > 0 ? (
              <section className="mt-10">
                <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  Shared with you
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Events someone invited you to help run.
                </p>
                <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                  {shared.map((t) => {
                    const role = sharedRoles.get(t.id);
                    return (
                      <li key={t.id}>
                        <Link
                          href={`/t/${t.slug}/manage`}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-card/60"
                        >
                          <span className="min-w-0">
                            <span className="text-sm font-medium">{t.name}</span>
                            {t.game_name ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {t.game_name}
                              </span>
                            ) : null}
                          </span>
                          <span className="text-xs font-semibold text-primary">
                            {isAdminRole(role) ? ROLE_LABELS[role] : "Helper"}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {past.length > 0 ? (
              <Section
                title="Past"
                tournaments={past}
                action={<BulkDeletePast count={past.length} />}
              />
            ) : null}
            {archived.length > 0 ? (
              <details className="group">
                <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Archived ({archived.length})
                  <span className="text-[10px] font-medium normal-case tracking-normal text-muted-foreground/70 group-open:hidden">
                    — show
                  </span>
                </summary>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {archived.map((t) => (
                    <TournamentCard key={t.id} t={t} />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

function Section({
  title,
  tournaments,
  action,
}: {
  title: string;
  tournaments: DashboardTournament[];
  action?: ReactNode;
}) {
  if (tournaments.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tournaments.map((t) => (
          <TournamentCard key={t.id} t={t} />
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border py-20 text-center">
      <div className="max-w-sm">
        <h3 className="text-lg font-bold">No tournaments yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Spin up your first bracket in under a minute. You can add 2–128 players
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
