// Seed the demo tournament: 6 players, 2 seeding rounds -> single-elimination,
// scored mode, points-scored tiebreaker. Idempotent.
//
// Run with:  npm run seed
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_EMAIL = "demo-organizer@bracketnight.local";
const DEMO_SLUG = "demo-game-night";

async function getOrCreateDemoUser() {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;

  // Prefer a real signed-in user so the demo is yours to manage. Sign in with
  // Google once, then run `npm run seed`, and you own the demo tournament.
  const real = data.users.find((u) => u.email !== DEMO_EMAIL);
  if (real) return { id: real.id, email: real.email };

  const existingDemo = data.users.find((u) => u.email === DEMO_EMAIL);
  if (existingDemo) return { id: existingDemo.id, email: DEMO_EMAIL };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: "Demo Organizer" },
  });
  if (createErr) throw createErr;
  return { id: created.user.id, email: DEMO_EMAIL };
}

async function main() {
  const organizer = await getOrCreateDemoUser();
  const organizerId = organizer.id;
  console.log("Demo organizer:", organizer.email, organizerId);

  // Remove any prior demo tournament (cascades to players/results).
  await admin.from("tournaments").delete().eq("slug", DEMO_SLUG);

  const { data: tournament, error: tErr } = await admin
    .from("tournaments")
    .insert({
      organizer_id: organizerId,
      name: "Friday Night Ping-Pong Classic",
      game_name: "Table Tennis",
      slug: DEMO_SLUG,
      format: "single_elim",
      scoring_mode: "scored",
      seeding_method: "seeding_rounds",
      tiebreak: "points_scored",
      ai_tone: "hype",
      draw_seed: 1234,
      status: "live",
      config: { seedingRounds: 2 },
    })
    .select()
    .single();
  if (tErr) throw tErr;

  const names = ["Alex", "Bailey", "Cory", "Devon", "Emerson", "Frankie"];
  const rows = names.map((name, i) => ({
    tournament_id: tournament.id,
    name,
    position: i,
  }));
  const { error: pErr } = await admin.from("players").insert(rows);
  if (pErr) throw pErr;

  console.log(`\nSeeded demo tournament "${tournament.name}".`);
  console.log(`Public hub:     /t/${DEMO_SLUG}`);
  console.log(
    `Organizer view: sign in as ${organizer.email} and open the dashboard.`,
  );
  console.log(
    "\nTip: it starts in the seeding phase — enter the 6 seeding-round scores in the",
  );
  console.log("organizer view and the single-elimination bracket will draw itself.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
