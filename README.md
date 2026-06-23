# Bracket Night

**ESPN for your game night.** Create a tournament, generate the schedule/bracket,
enter scores, and let Bracket Night run a live, broadcast-style hub: scoreboard,
standings, power rankings, AI matchup previews, TV mode, and end-of-event awards.

Built with **Next.js (App Router) + TypeScript**, **Tailwind + shadcn/ui**,
**Supabase** (Postgres + Auth with Row Level Security), and the **Anthropic
Claude API** for matchup previews.

> Branding lives in one place — edit `src/lib/branding.ts` to rename the app.

---

## Table of contents

1. [What you get (MVP scope)](#what-you-get-mvp-scope)
2. [Tech stack & architecture](#tech-stack--architecture)
3. [Prerequisites](#prerequisites)
4. [1. Create the Supabase project](#1-create-the-supabase-project)
5. [2. Run the database migrations](#2-run-the-database-migrations)
6. [3. Set up Google OAuth](#3-set-up-google-oauth)
7. [4. Configure environment variables](#4-configure-environment-variables)
8. [5. (Optional) Anthropic API key](#5-optional-anthropic-api-key)
9. [6. Local development](#6-local-development)
10. [7. Seed the demo & run it](#7-seed-the-demo--run-it)
11. [Tests](#tests)
12. [Deploy to Vercel](#deploy-to-vercel)
13. [Format engine reference](#format-engine-reference)
14. [Defaults & design decisions](#defaults--design-decisions)
15. [Phase 2 roadmap](#phase-2-roadmap)

---

## What you get (MVP scope)

- **Organizer accounts** via Google sign-in. The organizer is the only one who
  enters scores and advances the event. An organizer can own multiple events
  and has a dashboard of active/past tournaments.
- **Public, read-only hub** at `/t/[slug]` — anyone can follow schedule,
  standings, rankings, and previews with no account.
- **Guided creation wizard:** basics → players (2–128) → scoring mode →
  seeding method → format → tiebreaker → AI tone → review.
- **Formats:** Round Robin, Single / Double / Triple Elimination, and
  Group Stage → Knockout (World Cup style), all with correct bye handling.
- **Seeding:** manual drag-rank, random draw, or seeding rounds that feed the
  main bracket.
- **The hub:** now-playing scoreboard with quick score entry, schedule, live
  standings, power rankings with movement arrows, pre-game AI previews,
  running stat leaders, an awards screen, and a **full-screen TV mode**.
- **Exports:** public share link, printable bracket + standings (print/PDF),
  CSV of schedule/scores/standings, and a shareable results image card.

---

## Tech stack & architecture

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) |
| UI | Tailwind CSS v3, shadcn/ui, lucide-react, @dnd-kit (drag-rank) |
| Data | Supabase Postgres + Supabase Auth (Google OAuth), RLS enforced |
| AI | `@anthropic-ai/sdk` — Claude Haiku for short previews |
| Tests | Vitest (pure-logic format engine) |
| Deploy | Vercel |

**Where the logic lives**

- `src/lib/engine/` — the **pure, dependency-free tournament engine** (schedule
  generation, bracket resolution, standings, tiebreakers). Fully unit-tested.
- `src/lib/db.ts` — maps Supabase rows ⇄ engine inputs and computes live state.
- `src/lib/actions/` — server actions (auth-guarded CRUD, score entry, previews).
- `src/components/hub/` — the broadcast hub UI (shared by organizer & public).
- `supabase/migrations/` — schema + RLS; `scripts/seed.mjs` — the demo seed.

**Only results are persisted.** The full schedule/bracket is *derived*
deterministically by the engine from the tournament config + players + recorded
results. This keeps the database tiny and guarantees the bracket can never drift
out of sync with the scores.

---

## Prerequisites

- **Node.js 20+** (developed on Node 26) and npm.
- A free **Supabase** account.
- A **Google Cloud** project (for OAuth).
- *(Optional)* an **Anthropic** API key for AI-written previews.

```bash
npm install
```

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> → **New project**. Pick a name and a database
   password; wait for it to provision.
2. In the dashboard, open **Project Settings → API** and note:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret)

---

## 2. Run the database migrations

Open **SQL Editor** in the Supabase dashboard and run the two migration files
**in order**:

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`

(Or, with the Supabase CLI: `supabase db push` after linking the project.)

This creates `profiles`, `tournaments`, `players`, `match_results`, and
`ai_previews`, a trigger that auto-creates a profile on sign-up, and Row Level
Security policies: **public read** on tournaments and their children (so the
shared hub works for anyone), **organizer-only writes**.

---

## 3. Set up Google OAuth

1. In **Google Cloud Console** → **APIs & Services → Credentials**, create an
   **OAuth client ID** of type **Web application**.
2. Add an **Authorized redirect URI** pointing at Supabase's callback:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   (Find the exact URL in Supabase under **Authentication → Providers → Google**.)
3. Copy the **Client ID** and **Client secret**.
4. In the **Supabase dashboard → Authentication → Providers → Google**, enable
   Google and paste the Client ID + secret. Save.
5. Under **Authentication → URL Configuration**, set the **Site URL** to your
   app origin (e.g. `http://localhost:3000` for dev) and add it (plus your
   Vercel URL) to **Redirect URLs**.

The app's own callback route is `/auth/callback`, which exchanges the OAuth code
for a session and redirects to the dashboard.

---

## 4. Configure environment variables

Copy the example and fill in your values:

```bash
cp .env.example .env.local
```

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=   # optional
```

---

## 5. (Optional) Anthropic API key

Create a key at <https://console.anthropic.com> and set `ANTHROPIC_API_KEY`.

With a key set, pre-game previews are written by **Claude Haiku** in the tone you
chose (hype / trash-talk / analyst). **Without a key the app still works** — it
falls back to deterministic templated previews, and a transparent heuristic
predicted winner is always shown either way. AI calls are cached per matchup and
never block or crash the UI.

---

## 6. Local development

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run typecheck
npm run lint
```

Sign in at `/login` with Google, then create a tournament from the dashboard.

---

## 7. Seed the demo & run it

The seed creates the spec's showcase event: **6 players, 2 seeding rounds →
single-elimination bracket, scored mode, points-scored tiebreaker.**

```bash
# Sign in once with Google first so the demo is owned by your account,
# then run the seed (it picks the existing user; otherwise it creates a
# placeholder demo organizer):
npm run seed
```

Then:

1. Open **`/t/demo-game-night/manage`** (or click it from your dashboard).
2. The event starts in the **seeding phase** — enter the 6 seeding-round
   scores. The moment seeding completes, the single-elimination bracket draws
   itself from the seeding standings.
3. Enter bracket results to a champion. Watch the scoreboard, standings, power
   rankings (with movement arrows), previews, and awards update live.
4. Open **TV mode** (top-right) to cast the auto-rotating display, or the public
   hub at **`/t/demo-game-night`** to see the read-only view anyone can follow.

---

## Tests

The error-prone logic — bracket generation for every format (including byes),
the group-stage draw + advancement + cross-group knockout seeding, seeding-round
standings, and tiebreaker resolution — is unit-tested with Vitest.

```bash
npm test          # run once
npm run test:watch
```

All tests live next to the engine in `src/lib/engine/*.test.ts`.

---

## Deploy to Vercel

1. Push the repo to GitHub and **import it into Vercel**.
2. Add the same environment variables (Project → Settings → Environment
   Variables): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, and optionally `ANTHROPIC_API_KEY`.
3. In Supabase **Authentication → URL Configuration**, add your Vercel domain to
   the Site URL / Redirect URLs.
4. Deploy. The build runs `next build` (type-checked and linted).

---

## Format engine reference

All formats produce a sequential **"next up"** queue (games run one at a time;
the engine is structured to extend to parallel stations later).

- **Round Robin** — everyone plays everyone once (optionally twice). Final
  standings by record + tiebreakers.
- **Single Elimination** — lose once and out. Non-power-of-two counts pad to the
  next power of two with **byes awarded to the top seeds**; byes are shown
  explicitly.
- **Double Elimination** — winners + losers brackets; out after two losses.
  Includes correct **grand-final reset** logic (a reset game is played only if
  the losers-bracket finalist wins the first grand final). Dropout placement
  uses a straightforward index mapping rather than elaborate anti-rematch
  crossing — elimination correctness (one champion, out after exactly two
  losses) holds regardless.
- **Triple Elimination** — implemented as a documented **multi-life (N-life)
  elimination**: every player carries a life count and is out after three
  losses. Each round pairs survivors by fewest losses then best seed
  (Swiss-style), avoids immediate rematches where possible, and gives a
  non-penalizing bye on odd counts. Rounds are generated one at a time as
  results come in. The last player standing is champion. (A rigid triple-elim
  *tree* has no single canonical shape; this keeps the format correct and always
  produces a clear next-up queue.)
- **Group Stage → Knockout** — each group plays a round robin (single or
  double); the top N advance. Knockout seeding uses **cross-group pairing** so
  same-group players don't meet in round one (Group A winner vs Group B
  runner-up, etc.) for the canonical even-group / top-2 case, with a
  record-ranked fallback otherwise. The knockout runs as single elimination by
  default (double/triple optional).

**Seeding rounds** — 1, 2, 3, or a full round robin of randomized, distinct
matchups (non-penalizing byes for odd counts). After seeding, final seeds are
**best record first**, then the chosen points tiebreaker, then the fallback.

**Standings ranking** (app-wide, not a soccer-style points table):

1. **Most wins.**
2. **Head-to-head** among the tied players.
3. The organizer's chosen **points tiebreaker** (points scored, or fewest points
   allowed).
4. **Point differential** (documented fallback).
5. A **clearly-flagged random tiebreak** (deterministic given the draw seed; the
   affected rows are marked with 🎲).

**Ties** are format-dependent: draws are allowed in round-robin and seeding
rounds (W-L-D record), and disallowed in elimination brackets (a winner is
forced).

**Editing results** — the organizer can edit or clear any completed result. A
warning is shown before saving (it recomputes standings, rankings, and any
downstream bracket matchups), then everything recalculates automatically.

**Dropouts / no-shows** — the organizer can mark a player **withdrawn**. Their
remaining matches become forfeits (a win for the present opponent, recorded with
zero points), they sort to the bottom of the standings, and bracket advancement
recomputes. Reinstating a player is one click.

---

## Defaults & design decisions

- **Product name** defaults to **Bracket Night** (`src/lib/branding.ts`).
- **Dark-first** broadcast palette (broadcast red on a near-black scoreboard).
- **Scoring mode** defaults to *Scored*; **seeding** to *Random*; **format** to
  *Single Elimination*; **tiebreaker** to *Points scored*; **AI tone** to *Hype*.
- **Single game per match** by default; **best-of-3/5 series** can be enabled
  per tournament for elimination matches (Match settings in the wizard).
- **AI model:** the smallest current Claude model (`claude-haiku-4-5`) for fast,
  cheap previews; previews are cached and degrade to templates without a key.
- **Group draw "manual"** is done via a per-player group selector (clear and
  reliable) rather than drag-and-drop; manual *seeding* uses true drag-rank.
- **TV mode** updates live via Supabase Realtime, with a 30s polling fallback if
  the socket drops (a "Live / Reconnecting…" indicator shows which is active).
- **Reproducible randomness:** every tournament stores an integer draw seed, so
  random draws and the random tiebreak are deterministic and reproducible.

---

## Phase 2 roadmap

### Shipped

- **Delete & archive tournaments** — hard delete (with a typed-name confirm for
  in-progress events) plus soft-delete archiving and a "Show archived" toggle.
- **Round & phase transition clarity** — a persistent phase bar, broadcast-style
  transition banners, current-round highlighting, and a TV "Round Complete"
  interstitial.
- **Bulk player import** — paste-a-list or CSV/TXT upload with dedupe and a count
  preview, for fast 128-player rosters.
- **Templates / presets** — one-click setups (8-player single elim, 12-player
  round robin, 16-player double elim, 32-player World Cup, 128-player mega
  event) in `src/lib/templates.ts`.
- **Duplicate tournament** — clone setup and player names into a fresh event.
- **Notes / house rules** — optional free text shown on the hub and print view.
- **Multi-stage group pipeline** — a new `multi_stage` format: a configurable
  pipeline of group / round-robin / elimination stages that narrows the field to
  a champion (e.g. 128 → 32 → 8 → winner). Lazy per-stage generation, namespaced
  match keys, and a wizard timeline with live preview. See `src/lib/engine/multiStage.ts`.
- **Per-stage export / print** — print sections and CSV stage column + filter for
  multi-stage and group-knockout events.
- **QR code + share card** — client-side QR (no external API) on the manage view
  and dashboard, plus a downloadable branded share card.
- **Mid-tournament player add** — organizers add late arrivals; the bracket
  re-draws from the expanded pool (played results preserved).
- **Parallel stations** — run up to 8 concurrent matches; the scoreboard and TV
  mode show one "now playing" card per station.
- **Best-of-N series** — per-tournament best-of-3/5 for elimination matches,
  entered game-by-game with the series winner detected automatically.
- **Supabase Realtime** — the hub and TV mode update live on score changes, with
  a 30s polling fallback.
- **Player self-service scoring** — optional mode where players submit results
  via the public link for organizer approval (Approvals tab).

### Still deferred

- **Team / doubles support** — teams with rosters competing as a unit in any
  format, with team-level standings and awards, alongside the existing
  individual mode.
- **Persistent players + AI recaps** — reusable player profiles with all-time
  stats across an organizer's events, plus AI-generated post-game recaps and a
  final tournament wrap-up story.
- **Optional sound FX** for TV mode.
