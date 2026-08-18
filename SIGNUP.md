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
- **Questions** — any number, in two groups:
  - *Asked once per team* — answered by whoever registers the team.
  - *Asked of every member* — repeated for each person on the roster.

Question types: short answer, paragraph, multiple choice, checkboxes, yes/no,
number, email, phone, and **agreement**. Each can be required or optional, carry help text, and be
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
- **Sign-ups tab → Export responses** — CSV, one row per person, opening
  directly in Excel. Columns: team, role, name, email, phone, status, source,
  checked in, then every team question, then every member question. Team answers
  repeat on each member's row so you can sort or filter by any column.

## Where the rules are enforced

Three layers, because the sign-up endpoint is public:

1. The form itself validates before submitting.
2. `submitSignup` re-validates server-side against the saved form.
3. RLS (migration 0011) independently checks that sign-ups are open, the event
   isn't complete, the sign-up type is allowed, and the close time hasn't passed.

Unknown or hidden answers are dropped rather than stored, and text is
length-capped, so nothing arbitrary reaches the database through the public path.

## Google Forms

Still supported as an alternative — see [GOOGLE_FORM.md](GOOGLE_FORM.md). The
native form is usually the better choice now: it stores structured answers,
enforces roster rules at submission, and needs no CSV round trip. Use a Google
Form when you specifically want responses living in your own Google account.
