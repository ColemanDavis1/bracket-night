# Sign-ups

How people get into a tournament. Set on the **Sign-ups** tab, or in the create
wizard under *How do people join?*

## Three styles

| Style | What it does | Entrants are |
|---|---|---|
| **Large event** | Teams register through a custom form you build and share | Teams |
| **Manual entry** | No public form; you type in the players yourself | Players you enter |
| **Individual sign-up** | People sign up one at a time through a shared link | Each person |

A style is a preset over three switches — entry mode, whether sign-ups are open,
and which paths the form offers. All three stay individually editable afterward,
so you can start from a style and adjust. Switching style never touches rosters,
results, or the bracket.

## The form builder

Available for the two public styles. Everything you set appears on the sign-up
link and QR code.

- **Intro** — a blurb at the top of the form.
- **Email / phone** — each is *Don't ask*, *Optional*, or *Required*.
- **Ask contact details of** — the captain only, or every member.
- **Sign-ups close at** — after this moment the form stops accepting responses.
  You can still add people by hand.
- **Require a full roster at sign-up** — teams must name a complete roster to
  submit, using the min/max under Team size in Settings.
The builder is always available, whatever the style. Build the form whenever you
like; it only becomes reachable once you pick a public style and open sign-ups.

- **Questions** — any number, in two groups:
  - *Asked once per team* — answered by whoever registers the team.
  - *Asked of every member* — repeated for each person on the roster.

Question types: short answer, paragraph, multiple choice, checkboxes, yes/no,
number, email, phone, date, time, link, and **agreement**. Every one can be
required or optional. Each can be required or optional, carry help text, and be
shown conditionally — *only show when [question] is [answer]* — which is how
follow-ups like "if yes, which ones?" work.

An **agreement** question is the "you must accept this to take part" case — a
waiver, a code of conduct, a mailing-list opt-in that participation depends on.
It renders as a single checkbox beside its text and is always required: the form
will not submit until it is ticked, and the export records it as `Agreed` against
each person who accepted. Put it in *asked of every member* when each player must
accept for themselves, or in *asked once per team* when the captain accepts on
the roster's behalf.

**Preview** renders the real form controls, not a mock-up. What you see is the
component the public page uses.

## Worked example

The event: teams of 6–8, team sign-up only until the form closes, then walk-ins
added by hand. Required Bible-study question with a follow-up, required email and
phone, optional dorm.

1. **Settings → Team size**: min 6, target 8, max 8.
2. **Sign-ups → How people join**: Large event. This sets team mode, opens
   sign-ups, and restricts the form to full teams.
3. **Sign-up form**:
   - Email: Required. Phone: Required. Ask contact details of: Every member.
   - Sign-ups close at: one hour before your start time.
   - Require a full roster at sign-up: on. Teams must name 6–8 players.
4. **Questions asked once per team** — add two:
   - `Are any members interested in a Bible study?` — Yes / No, required.
   - `Which members?` — Short answer, required, *only show when* the first
     question *is* Yes.
5. **Questions asked of every member** — add one:
   - `Which dorm (if any)?` — Short answer, optional.
6. **Save form**, then copy the sign-up link or print the QR code.

After the close time passes, the public form shuts itself. Add latecomers on the
**Teams** tab with *Add a walk-in*, and drag people between teams there.

## Seeing and editing responses

- **Teams tab** — the roster board. Each person shows their answers under their
  name. Move people with the per-row dropdown, the one-click *move to solo pool*
  button, or by ticking several and using the bulk bar. Trash icon removes
  someone entirely.
- **Sign-ups tab → Responses** — a table of everyone recorded, with their email,
  phone, team, and status, visible without downloading anything.
- **Export to Excel** — CSV, one row per person, opening directly in Excel. Columns: team, role, name, email, phone, status, source,
  checked in, then every team question, then every member question. Team answers
  repeat on each member's row so you can sort or filter by any column.

### Collecting an email for everyone

By default contact details are asked of **the captain only**, so a team of eight
records one email. Set *Ask contact details of* to **Every member** in the builder
if you need one per player. The Responses panel says how many of each you have, so
this is visible before the event rather than at export time.

## Where the rules are enforced

Three layers, because the sign-up endpoint is public:

1. The form itself validates before submitting.
2. `submitSignup` re-validates server-side against the saved form.
3. RLS (migration 0011) independently checks that sign-ups are open, the event
   isn't complete, the sign-up type is allowed, and the close time hasn't passed.

Unknown or hidden answers are dropped rather than stored, and text is
length-capped, so nothing arbitrary reaches the database through the public path.

## Importing people from a spreadsheet

Separate from the form: **Teams tab → Import CSV** bulk-adds people from any
spreadsheet with a name column (plus optional email, phone, team name, and
teammate columns). Everything imported lands in the approval queue. Use it to
carry over a roster you already collected elsewhere; new sign-ups should go
through the form, which stores structured answers the import cannot.

## Deciding details later

Nothing has to be known before the form goes out. Send the link first, then set
the rest on the **Settings** tab as it firms up — every setting is editable after
creation:

- **Format** — including switching to or from a multi-stage pipeline, and editing
  the pipeline's stages in place.
- **Courts & stations** — how many run at once, and what each is called (Court 1,
  Table A, Back Yard). Safe to change mid-event.
- **Team size** — min, target, and max, which also drives the form's
  full-roster rule.
- **Seeding, scoring, tiebreaker, match length**, house rules, event date, name.

Format, seeding, and pipeline changes rebuild the schedule. Before anything is
played that costs nothing; afterwards Settings asks you to confirm clearing the
scores first, since a rebuild renumbers the matches.

## Courts

Set the count and names on **Settings → Courts & stations**. Once a match is put
on a court it stays there until it is finished — assignments are sticky, and
auto-assign only ever fills courts nothing is sitting on.

A court shows one of three states on the **Courts** tab and the TV board:

- **Open** — nothing on it.
- **Up next** — a match is reserved for it. Press *Call to court* to start.
- **Live** — the match has been called.

When you enter a score the court frees itself and the next match in schedule
order is reserved on it automatically, so the board keeps itself current without
anyone pressing auto-assign. *Auto-assign courts* does the same thing on demand
for every empty court at once.

## Sharing control of an event

**Settings tab → Who can help run this** (owner only). Invite by email, pick a
role, then send them the manage link — the invite activates the moment they sign
in with that address, so they don't need an account first. Shared events also
appear on their dashboard under *Shared with you*.

| Role | Can | Cannot |
|---|---|---|
| **Owner** | Everything, including access and deletion | — |
| **Co-organizer** | The form, sign-ups, rosters, settings, scores | Delete the event, change access |
| **Sign-ups & rosters** | Send and edit the form, approve sign-ups, build rosters | Enter scores, change settings |
| **Scorekeeper** | Enter scores, run the call board | Change the form, rosters, or settings |

Each role only sees the tabs it can use. Enforcement is layered: capability checks
guard every server action, and RLS (migration 0012) independently keeps deletion
and access changes with the owner and settings with the owner or a co-organizer.

Invites are not emailed — send the manage link yourself.
