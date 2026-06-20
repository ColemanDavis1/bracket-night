# Deployment & Setup Walkthrough

Four accounts/keys you set up, then Claude Code and Vercel do the rest. Estimated time: 20-30 minutes. Do steps 1-2 before/while Claude Code builds; do 3-4 once the build runs locally.

---

## Step 1 — Supabase (database + auth backend)

1. Go to **supabase.com**, sign in (Google or GitHub login is fastest), click **New project**.
2. Name it (e.g. `bracket-night`), set a database password (save it), pick the closest region, create.
3. Wait ~2 minutes for it to provision.
4. **Find the Project URL.** Click the green **Connect** button at the top of the page (or left sidebar gear icon **Project Settings > Data API**). Copy the **Project URL** (`https://<your-ref>.supabase.co`) → `NEXT_PUBLIC_SUPABASE_URL`.
5. **Find the keys.** Left sidebar gear icon **Project Settings > API Keys**. New projects use the new key system (the classic `anon`/`service_role` keys are now under a separate **Legacy API Keys** tab). On the default **API Keys** tab:
   - **Publishable key** (starts with `sb_publishable_...`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-side, safe to expose). This is the modern replacement for the anon key.
   - In the **Secret keys** section, click **Create new secret key**, name it, and copy the value (starts with `sb_secret_...`) → `SUPABASE_SERVICE_ROLE_KEY` (server-side only, keep secret). This is the modern replacement for the service_role key.
   - *Note:* you can only copy a secret key once at creation, so paste it into `.env` immediately.
6. Note your **project ref** (the random string in the Project URL, e.g. `abcdxyz` in `https://abcdxyz.supabase.co`). You need it in Step 2.
6. Tell Claude Code to run the SQL migrations it generated (it can push them to Supabase, or you paste them into **SQL Editor > New query > Run**).

---

## Step 2 — Google sign-in (OAuth)

1. Go to **console.cloud.google.com**. Create a new project (top bar) or use an existing one.
2. Left menu: **APIs & Services > OAuth consent screen**. Choose **External**, fill in app name + your email, save. Add yourself as a **test user** so you can log in during development.
3. Left menu: **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized JavaScript origins:** add `http://localhost:3000` and (later) your Vercel URL.
   - **Authorized redirect URIs:** add `https://<your-project-ref>.supabase.co/auth/v1/callback` (use the ref from Step 1).
   - Create. Copy the **Client ID** and **Client Secret**.
4. Back in Supabase: **Authentication > Providers > Google**. Toggle it on, paste the Client ID and Client Secret, save.

That's it — sign-in now works. No code changes needed.

---

## Step 3 — Run it locally (confirm before deploying)

1. With `.env` filled in, tell Claude Code to start the dev server.
2. Open `http://localhost:3000`, sign in with Google, and run the 6-player demo to confirm everything works.
3. Fix anything with Claude Code before deploying.

---

## Step 4 — Deploy to Vercel (live URL)

1. Tell Claude Code to **push the repo to GitHub** (it can create the repo and push).
2. Go to **vercel.com**, sign in with GitHub, click **Add New > Project**, and **import** that repo.
3. In the import screen, open **Environment Variables** and paste the same values from your `.env` (Supabase URL, anon key, service role key, and the Anthropic key if you're using AI previews).
4. Click **Deploy**. You get a live URL in ~2 minutes.
5. **Final wiring:** copy your new Vercel URL, then add it to:
   - Google Cloud Console > Credentials > your OAuth client > **Authorized JavaScript origins** and **redirect URIs** (add the Vercel domain).
   - Supabase > **Authentication > URL Configuration** > set the **Site URL** to your Vercel URL.

Done. Every future `git push` from Claude Code auto-redeploys.

---

## What's optional

- **Anthropic API key** (`ANTHROPIC_API_KEY`): only needed for AI-written matchup previews. Skip it to launch — the app falls back to templated previews. Add it later anytime.

## Quick reference — env vars

```
NEXT_PUBLIC_SUPABASE_URL=        # Step 1
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Step 1
SUPABASE_SERVICE_ROLE_KEY=       # Step 1 (secret)
ANTHROPIC_API_KEY=               # optional
```
