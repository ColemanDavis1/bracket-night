# Google Form setup for sign-ups

## Fastest path: let the app build the form

Teams tab → **Generate a Google Form**. The app emits a Google Apps Script matched to
your event — the right questions for your sign-up mode, one teammate question per
roster spot, worded so the CSV import maps with no manual fixing.

1. Copy the script and open [script.google.com](https://script.google.com/home/projects/create) → New project.
2. Replace the editor contents with it and press **Run**.
3. Approve the permission prompt. The script only creates a form; it reads nothing.
4. Open **View > Logs**, copy the form link, paste it back into the app to save it
   with the event.

The form is created in your own Google Drive and owned by you — the app never touches
your Google account. Everything below documents the same structure by hand, for when
you'd rather build or adapt a form yourself.

## Two channels, set independently

| Channel | Who can sign up | Set where |
|---|---|---|
| Native sign-up page (the link + QR code) | **Teams or solo players** / **Full teams only** / **Solo players only** | Teams tab → *Who can sign up*, or the create wizard |
| Google Form | Whatever you build into the form | Google Forms |

They don't have to match. A common setup is a team-only Google Form for advance
registration and a both-paths QR code at the door, so latecomers can join alone and
get placed on a team. The mode setting gates the native page only — Google Form CSV
imports and organizer walk-in adds are trusted and never filtered.

If you want the Google Form to be team-only, drop question 4 below (`solo or team`)
and make **Team Name** required: every row then imports as a team sign-up. For a
solo-only form, drop questions 4, 5, and the teammate questions.


The Team Builder imports a Google Form CSV export (Teams tab → **Import Google Form CSV**).
Columns are matched by header text, case-insensitively, so the form only has to be
worded in a way the importer recognizes. Build it exactly like this and the import
needs zero manual mapping.

## Recommended questions, in order

| # | Question (form title) | Type | Required | Why this wording |
|---|---|---|---|---|
| 1 | **Your Name** | Short answer | Yes | Matched as the person's name. Avoid a bare "Name". |
| 2 | **Email Address** | Short answer (or Forms' built-in email collection) | Yes | Matched on `email` / `e-mail`. |
| 3 | **Phone Number** | Short answer | No | Matched on `phone` / `mobile` / `cell`. |
| 4 | **Are you signing up solo or as a team?** | Multiple choice: `Solo` / `Team` | Yes | Matched on `solo` / `individual`. Anything containing "team" imports as a team sign-up; everything else as solo. |
| 5 | **Team Name** | Short answer | No | Matched on a header containing both "team" and "name". Leave blank for solo. |
| 6+ | **Teammate 2 Name**, **Teammate 3 Name**, … | Short answer, one per slot | No | Every header containing "teammate" is collected, in form order. |

Number the teammate questions starting at **2** — the person filling out the form is
teammate 1 and is imported as the team's captain.

### One question per teammate vs. one combined box

Both work:

- **One question per teammate** (recommended). Add as many `Teammate N Name`
  questions as your max roster size minus one. Blanks are skipped. This gives clean,
  one-name-per-cell data and lets you set the roster cap visually in the form.
- **One combined box**, titled `Teammates`. Names are split on commas, semicolons,
  slashes, and newlines. Fewer questions, messier data.

## Form settings that matter

- **Turn off "Limit to 1 response"** unless every person has a Google account —
  otherwise walk-ins and shared devices get blocked.
- **Collect email addresses: on** if you want reliable dedupe. People are deduped by
  name, plus email when present, so two different people named "Chris Smith" both
  survive the import when their emails differ.
- **Keep the first question as the person's name.** If no header matches, the importer
  falls back to the first non-timestamp column.
- Google's `Timestamp` column is ignored. Extra questions (t-shirt size, waiver, etc.)
  are ignored too, so add whatever else you need.

## Import behavior worth knowing

- Everything imported lands in the **approval queue** as pending. Nobody enters a team
  until you approve them.
- Approving a team sign-up creates the team automatically from the team name, or
  attaches the person to an existing team with that name. Same team name across
  several submissions merges into one roster.
- Solo sign-ups go to the **solo pool**. Use **Auto-fill teams** to balance them across
  teams toward the target size.
- Roster caps are enforced on the native sign-up page and on organizer-side adds
  (walk-ins, drag-to-team). A Google Form can't enforce them, so an over-max team
  imported from CSV shows an "over max" badge on its card for you to fix.
- Re-importing the same CSV is safe: duplicates by name (+ email) are skipped and
  reported in the preview.

## One-line paste test

Paste this into the import box to sanity-check the mapping before the event:

```
Your Name,Email Address,Are you signing up solo or as a team?,Team Name,Teammate 2 Name,Teammate 3 Name
Bob,bob@example.com,Team,Bob Squad,Carol,Dave
Alice,alice@example.com,Solo,,,
```

The preview should read: 3 to add, 1 team, 1 solo.
