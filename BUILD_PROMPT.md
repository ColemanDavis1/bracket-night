# Game Night Tournament Hub — Claude Code Build Package

This file has three parts:

1. **The build prompt** — paste the entire block into Claude Code.
2. **Your setup checklist** — the handful of things only you can do (create accounts, get keys).
3. **Phase 2 follow-up prompts** — paste-ready prompts to extend the app later.

---

# PART 1 — BUILD PROMPT (paste everything below into Claude Code)

> You are building a production-quality web application. Read the whole spec before writing code, set up a clean project, and implement the full MVP scope so it actually works end to end. Use sensible defaults for anything unspecified and document those defaults in the README. Only stop to ask me if you hit a genuine blocker.

## Product

Build the go-to web app for running and tracking game-night and event tournaments — "ESPN for home tournaments." An organizer creates a tournament, the app generates the schedule/bracket, the organizer enters scores, and the site presents a live, broadcast-style hub: scoreboard, standings, power rankings, AI matchup previews, and end-of-event awards.

Build a **solid, complete MVP** first. Everything in the MVP scope below must fully work — no stubs or fakes. End with a "Phase 2" section in the README listing the deferred features I name at the bottom.

### Suggested product names
Pick one as the default (make branding trivial to swap via a single config constant): **Bracket Night**, **Game Night Live**, **HomeCourt**, **TourneyHub**. Use "Bracket Night" if unsure.

## Tech stack (use exactly this unless a hard blocker forces a change)

- **Next.js** (latest stable, App Router) + **TypeScript** (strict; avoid `any`).
- **Tailwind CSS** + **shadcn/ui** for components.
- **Supabase**: hosted Postgres + Supabase Auth. Enforce **Row Level Security** so organizers only read/write their own data, with public read access for shared tournaments. Note: new Supabase projects use the new API key format — a **publishable key** (`sb_publishable_...`, client-side, used wherever the anon key was) and a **secret key** (`sb_secret_...`, server-side only, used wherever the service_role key was). Configure the client and server accordingly; these work with the standard supabase-js / SSR helpers.
- **Auth: Google sign-in** via Supabase OAuth. (Document the Google OAuth setup steps in the README.)
- **AI previews:** Anthropic Claude API via the official SDK, using a fast/cheap model (e.g. the smallest current Claude model) and reading `ANTHROPIC_API_KEY` from env. Degrade gracefully to templated text if the key is missing. Never block or crash the UI on AI calls; cache generated previews.
- **Deploy target:** Vercel. Must deploy cleanly.
- Provide `.env.example`, real SQL migrations for the schema + RLS policies, seed data, and a thorough README (Supabase project creation, Google OAuth, env vars, local dev, tests, deploy).

## Users & access

- **Organizers** sign in with Google. The organizer is the **only** person who enters scores and advances the tournament.
- Every tournament has a **public, read-only view** at `/t/[slug]` that anyone can open without an account to follow schedule, standings, and analysis. No edit controls in the public view.
- An organizer can own **multiple tournaments** and has a dashboard of active/past events.
- **Players are per-tournament only** (just names within a tournament) — no cross-tournament player profiles in the MVP.
- **Individuals only** in the MVP (no teams).

## Creation wizard (guided multi-step)

1. **Basics:** tournament name, optional date, game/sport name.
2. **Players:** enter count then names; add/remove/edit. Support **2–128 players**, optimized to look great across that whole range.
3. **Scoring mode (per tournament):** **win/loss only** OR **scored** (record actual point totals). Store a winner plus optional scores on every match so both modes are supported.
4. **Seeding method** (all of these must work):
   - **Manual** — organizer drag-ranks players 1..N.
   - **Random** — app assigns random seeds.
   - **Seeding rounds → bracket** — see detailed spec below.
5. **Main format:** Round Robin, Single Elimination, Double Elimination, Triple Elimination, or **Group Stage → Knockout** (World Cup style — see spec below).
6. **Tiebreaker:** organizer chooses head-to-head first, then **points scored** OR **points allowed** (user selects which), with a documented final fallback (point differential, then a clearly-flagged random tiebreak).
7. **AI preview tone (per tournament):** organizer picks **Hype sportscaster / Playful trash-talk / Balanced analyst**.
8. **Review & create.**

## Seeding-rounds mechanic (core — build carefully)

- Organizer chooses **how many seeding rounds**: 1, 2, 3, or "full round robin."
- Each seeding round pairs players in **randomized, round-robin-style matchups** — each player faces a different opponent each round where possible. Handle odd counts with a **non-penalizing bye**. (Example: 6 players, 2 seeding rounds → each plays 2 different opponents.)
- Seeding matches are scored. After seeding rounds, compute **final seeding standings**:
  - Primary sort: **most wins / best record**.
  - Tiebreaker: the rule chosen in setup (points scored or points allowed), then the documented fallback.
  - Best record → **#1 seed**; worst → last seed.
- Those seeds feed the **main bracket** (single/double/triple elimination), or simply produce final standings if Round Robin is the main format.
- Organizer may instead skip seeding rounds and use manual or random seeding.

## Group-stage → knockout mechanic (World Cup style — core, build carefully)

When "Group Stage → Knockout" is chosen as the main format:

- **Group assignment:** organizer chooses **Random draw** or **Manual assignment** (drag players into groups). If seeds exist (manual or from seeding rounds), use them to balance a random draw so top seeds are spread across groups.
- **Configuration:** organizer sets the **number of groups (or group size)** and **how many advance per group** (top 1 / 2 / 3). Validate that the number of advancers forms a valid knockout bracket (use byes to the top group-stage performers if it isn't a power of two).
- **Group play:** each group plays a **round robin** within the group; organizer can choose **single or double** round robin. Group standings use the same ranking rules as the rest of the app (wins first, then the chosen points-scored/points-allowed tiebreaker, then fallback).
- **Advancement:** the top N of each group advance to the knockout stage; eliminated players are clearly marked.
- **Knockout seeding — cross-group pairing (default):** pair advancers so same-group players don't meet immediately — e.g. **Group A winner vs Group B runner-up**, Group C winner vs Group D runner-up, etc. The knockout stage then runs as a standard single-elimination bracket (let the organizer optionally choose double/triple elimination for the knockout).
- The hub must clearly show **two phases**: live group tables during the group stage, then the bracket once knockout begins. Standings, power rankings, previews, and awards span the whole event.

## Format engine (implement correctly + unit-test)

- **Round Robin:** full schedule (everyone plays everyone once); standings by record + tiebreakers.
- **Single Elimination:** lose once and out.
- **Double Elimination:** winners + losers brackets, out after two losses, correct grand-final logic.
- **Triple Elimination:** out after three losses (document your bracket approach).
- **Non-even / non-power-of-two counts:** standard handling — **byes awarded to the top seeds** to fill to the next power of two; show byes explicitly in the UI.
- **Match format:** single game per match (no best-of series in MVP).
- **Scheduling:** games run **one at a time**. Present a clear sequential **"next up" queue**; the engine should be flexible enough to extend to parallel stations later.
- **Ties:** **format-dependent** — allow draws in round-robin and seeding rounds (use a W-L-D record), but force a winner in elimination brackets.
- **Standings ranking:** **wins first, then the chosen tiebreaker** (do not use a soccer-style points table).
- **Editing results:** organizer can edit/delete completed results; if a change affects downstream matches/seeds, **warn with a confirmation** before recomputing, then auto-recalculate standings, bracket advancement, and rankings.
- **Dropouts/no-shows:** organizer can mark a player **withdrawn**; apply sensible best-practice handling — future matches become forfeits/byes and standings adjust. Document the behavior.

## The hub experience (the showpiece)

Two clear areas: (A) setup/management, and (B) the **live tournament hub**. The hub must include:

- **Scoreboard / now playing:** prominent current-match display with quick score entry for the organizer.
- **Game schedule:** upcoming + completed matches with round labels (seeding vs main, round number), matchup, order, and result.
- **Standings & records:** live leaderboard — W-L(-D) record, points for/against, point differential, win streaks. Sortable; respects the tiebreaker.
- **Power rankings:** ranked list of all players that updates as games are played, **with movement arrows** (up/down/no change vs the previous update).
- **Pre-game matchup previews:** for upcoming matches, head-to-head history, a transparent predicted winner (heuristic from record/differential/recent form so a pick always exists), and an **AI-written analyst preview** in the organizer's chosen tone. (Previews only — no post-game recaps in MVP.)
- **Stats & awards:** running stat leaders (point differential, longest streak, biggest upset) and, on completion, an **awards screen**: MVP, Biggest Upset, Longest Streak, Points Leader.
- **TV / presentation mode:** a dedicated **full-screen display mode** to cast to a TV during the event, auto-rotating between scoreboard, standings, next-up, and previews.

## Exports & sharing (all in MVP)

- **Public shareable link** to the read-only hub.
- **Printable bracket + standings** (clean print/PDF view).
- **Shareable results image card** (social-style image of standings/awards for group chats).
- **CSV export** of schedule, scores, and standings.

## Visual identity

Anchor on a **broadcast-red accent on a dark scoreboard palette**. Blend ESPN broadcast energy (bold reds/blacks, big numbers, scoreboard ticker feel) with clean modern layout (whitespace, strong readable type) and a touch of playful game-night warmth (friendly microcopy, tasteful color pops). Keep motion **subtle/minimal** — light transitions and ranking-arrow movement only, no sound. **Balanced responsive design**: equally great on phone and desktop, plus the full-screen TV mode.

## Data model (Supabase — refine as needed)

At minimum: auth `users`; `tournaments` (storing format, scoring mode, seeding method, tiebreaker choice, AI tone, status, public slug); `players`/`participants`; `rounds` (seeding vs main + round number); `matches` (participants, winner, optional scores, status, forfeit flag); and computed `standings`/`rankings` via SQL views or functions. RLS: organizer-only writes, public read for shared tournaments.

## Quality bar

- Clean architecture, reusable components, friendly empty/loading/error states, form validation.
- **Unit tests** for the most error-prone logic: bracket generation (all formats incl. byes), group-stage draw + advancement + cross-group knockout seeding, seeding-standings computation, and tiebreaker resolution. Tests must pass.
- Ship **seed data** and README instructions to run a full demo immediately: **6 players, 2 seeding rounds → single-elimination bracket**, scored mode, points-scored tiebreaker.

## Deliverables

1. Full working codebase per spec.
2. SQL migrations + RLS policies + seed data.
3. `.env.example` + thorough README (Supabase, Google OAuth, env, run, test, Vercel deploy).
4. A README **"Phase 2"** section listing: team/doubles support; player self-service score entry; real-time live updates (Supabase Realtime); best-of-N series; parallel-station scheduling; persistent player profiles & all-time leaderboards; AI post-game and tournament-wrap recaps; optional sound FX for TV mode.

Build the MVP completely and make it genuinely work.

---

# PART 2 — YOUR SETUP CHECKLIST

Do these before/while Claude Code builds (it can scaffold, but these need your accounts):

1. **Supabase** — create a free project; copy the project URL and anon/service keys into `.env`.
2. **Google OAuth** — in Google Cloud Console create OAuth credentials, add the Supabase callback URL, and enable the Google provider in Supabase Auth.
3. **Anthropic API key** — create a key at the Claude console and set `ANTHROPIC_API_KEY` (optional; the app works without it using templated previews).
4. **Vercel** — connect the repo and add the same env vars for deployment.
5. Run the included SQL migrations and seed script, then start the dev server and try the 6-player demo.

---

# PART 3 — PHASE 2 FOLLOW-UP PROMPTS (paste later, one at a time)

**Teams support:**
> Add team/doubles support. Let organizers create teams with rosters that compete as a single unit in any format, with team-level standings, records, and awards. Keep individual mode fully working.

**Real-time + self-service scoring:**
> Add Supabase Realtime so the public hub and TV mode update live without refresh. Add an optional mode where players with the link can submit their own match results for organizer approval.

**Best-of series + parallel stations:**
> Add per-tournament best-of-N matches (single/3/5) tracked game-by-game, and let the organizer define multiple stations so concurrent matches schedule and display in parallel.

**Persistent players + AI recaps:**
> Add reusable player profiles with all-time stats across an organizer's tournaments, and AI-generated post-game recaps plus a final tournament wrap-up story.
