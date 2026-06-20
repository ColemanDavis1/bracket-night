import Link from "next/link";
import { ArrowRight, BarChart3, Sparkles, Trophy, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand";
import { BRANDING } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="relative overflow-hidden">
      {/* Ambient scoreboard glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_-10%,hsl(var(--primary)/0.25),transparent)]" />

      <header className="container flex items-center justify-between py-5">
        <BrandMark />
        <nav className="flex items-center gap-2">
          {user ? (
            <Button asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/login">Organizer sign in</Link>
            </Button>
          )}
        </nav>
      </header>

      <main className="container">
        <section className="flex flex-col items-center py-16 text-center md:py-24">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
            <span className="h-2 w-2 animate-pulse-red rounded-full bg-primary" />
            LIVE TOURNAMENT HUB
          </span>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            {BRANDING.tagline.replace(/\.$/, "")}
            <span className="block text-primary">Run game night like a broadcast.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Build the bracket, enter scores, and let {BRANDING.name} run the show
            — live standings, power rankings, AI matchup previews, and an
            end-of-night awards screen.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={user ? "/new" : "/login"}>
                Create a tournament <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={user ? "/dashboard" : "/login"}>View my events</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-24 md:grid-cols-4">
          {[
            {
              icon: Trophy,
              title: "Every format",
              body: "Round robin, single/double/triple elimination, group → knockout, and seeding rounds.",
            },
            {
              icon: BarChart3,
              title: "Live standings",
              body: "Records, point differential, win streaks, and power rankings with movement arrows.",
            },
            {
              icon: Sparkles,
              title: "AI previews",
              body: "Transparent predicted winners plus analyst write-ups in your chosen tone.",
            },
            {
              icon: Tv,
              title: "TV mode",
              body: "A full-screen, auto-rotating display to cast to the big screen during the event.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card p-5"
            >
              <f.icon className="mb-3 h-6 w-6 text-primary" />
              <h3 className="font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="container flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <BrandMark size="sm" />
          <p>Built for game nights. No account needed to follow along.</p>
        </div>
      </footer>
    </div>
  );
}
