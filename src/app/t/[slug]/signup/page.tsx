import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand";
import { SignupForm } from "@/components/signup-form";
import { normalizeSignupMode } from "@/lib/teams/signup-mode";
import {
  formClosed,
  FORM_CLOSED_MESSAGE,
  normalizeSignupForm,
} from "@/lib/signup/form-schema";
import type { TournamentRow } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("tournaments")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!data) notFound();
  const tour = data as TournamentRow;

  // Sign-ups are gated by the switch, the event still running, and the form's
  // own close time. Entry mode no longer matters: individual events collect
  // sign-ups too, they just become entrants directly rather than teams.
  const form = normalizeSignupForm(tour.config?.signupForm);
  const closed = formClosed(form);
  const open =
    tour.config?.signupEnabled === true && tour.status !== "complete" && !closed;

  const dateLabel = tour.event_date
    ? new Date(tour.event_date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div>
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/">
            <BrandMark />
          </Link>
          <Link
            href={`/t/${slug}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View event
          </Link>
        </div>
      </header>

      <main className="container max-w-md py-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{tour.name}</h1>
        {tour.game_name ? (
          <p className="text-sm text-muted-foreground">{tour.game_name}</p>
        ) : null}
        {dateLabel ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" /> {dateLabel}
          </p>
        ) : null}

        <div className="mt-6">
          {open ? (
            <SignupForm
              tournamentId={tour.id}
              teamSize={tour.config?.teamSize ?? null}
              signupMode={normalizeSignupMode(tour.config?.signupMode)}
              form={form}
            />
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="mt-3 text-lg font-bold">Sign-ups are closed</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {closed
                  ? FORM_CLOSED_MESSAGE
                  : "Registration for this event isn't open right now. Check with the organizer or follow the live event."}
              </p>
              <Link
                href={`/t/${slug}`}
                className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
              >
                View the live event →
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
