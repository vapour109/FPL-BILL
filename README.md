# The Bill

A side-stake tracker for your FPL Draft league — real cards, own goals, missed pens, assists,
braces and blanking starters, priced in euros. No login, no photo-reading AI — each manager
pastes their own weekly points table (copied straight from the FPL Draft site) and the app
computes exact charges from it.

## Current rates

| Event | Rate |
|---|---|
| Yellow card | €0.75 |
| Red card | €7.50 |
| Missed penalty | €3.75 |
| Own goal | €7.50 |
| Assist | €1.50 |
| Brace (2+ goals in a gameweek) | €7.50 |
| Started, 0 minutes played | €5.00 |

Originally calibrated off week-1 data to land around €250 per manager by season's end,
then scaled to 75% once a real gameweek showed it running expensive — except a starter
who blanks, held at a flat €5. Editable in the Admin tab — no redeploy needed.

## How it works

Two tabs.

**The Bill** — open to anyone with the link, no code and no login.

- Every team ranked by what they owe, with the running pot.
- Filter by gameweek to turn it into that week's leaderboard: who cost what in GW3.
- Tap a team for its breakdown — total per player, what each player did to earn it,
  and a full receipt. The week filter works in there too, so you can ask "what did
  this team cost me in GW3" as easily as "all season".

**Admin** — behind a code, for whoever runs the league.

- Add teams and rename them.
- Enter a gameweek: pick the team, pick the week, paste their FPL Draft points table.
  Preview shows exactly what will be charged before anything is written.
- Edit the rates.

Re-entering the same team and gameweek replaces that week's charges rather than
stacking them, so it's safe to redo if something looked off.

## A parsing quirk worth knowing

FPL Draft's pasted table already reflects automatic substitutions — so a player who started
but got 0 minutes and was auto-subbed off ends up listed under "Substitutes" in the text, not
"Starters." The parser reads the "Automatic Substitutions" block at the bottom of the paste
(the "Out" column) to catch this correctly regardless of which section they're listed under.

## Setup

Nothing to configure. The league's Supabase project is baked into
`src/lib/supabase.ts`, so a clone runs — and deploys — as-is.

Both baked-in values are `NEXT_PUBLIC_`, meaning they already ship inside the
JavaScript every visitor downloads; the anon key is not a secret and grants
exactly what the table policies allow. Access control comes from those policies,
which are deliberately open (see below).

To point the app at your own Supabase project instead:

1. Create a project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL
   editor. It creates all four tables with their indexes and policies, and is safe
   to re-run.
2. Set the two variables from Project Settings → API — they override the built-in
   defaults, so no code change is needed:

   ```
   cp .env.example .env.local
   ```

   The same two variables can be set in Vercel (Project Settings → Environment
   Variables) to override them for a deployment, which is also how you rotate the
   committed key.

## Run locally

```
npm install
npm run dev
```

## Checks

```
npm run check      # typecheck + lint + tests
```

Or individually: `npm run typecheck`, `npm run lint`, `npm test`. The tests cover
`parseGwTable` (the paste parser) and the rate handling — the two places where a bug
turns into a wrong number on someone's bill.

## Deploy to Vercel

1. Push this folder to a new GitHub repo
2. Go to vercel.com → New Project → import that repo
3. Deploy — you'll get a public URL, share it with your league

## Notes / honest limitations

- **Fouls** aren't in the FPL Points table at all, so they're not billable.
- Each manager must paste their own gameweek table — nothing is pulled automatically, since
  that data lives behind your FPL Draft login and the public API can't see it.
- Charges are computed from whatever's pasted, in good faith — there's no cryptographic
  verification that a paste is genuine. Fine for a friend group, not audit-proof.
- No login and no room code means anyone with the link can read the bill. That is
  deliberate — it's how the league checks the damage.
- **The admin code is a convenience lock, not security.** It ships in the client
  JavaScript, and the database policies are open to the anon key, so anyone determined
  can bypass it. It stops the league casually editing names, rates and scores; it would
  not stop someone who wanted to. The Supabase policies in `supabase/schema.sql` are open to the anon key to match,
  so anyone who reads the app's JavaScript can reach the data directly. Reasonable for a
  closed friend group sharing one link; don't put anything sensitive in there.
- Editing a rate only affects gameweeks logged afterwards. Charges keep the price they were
  logged at — re-paste a gameweek to re-price it.

