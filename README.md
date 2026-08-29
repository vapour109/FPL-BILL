# The Bill

A side-stake tracker for your FPL Draft league — real cards, own goals, missed pens, assists,
braces and blanking starters, priced in euros. No login, no photo-reading AI — each manager
pastes their own weekly points table (copied straight from the FPL Draft site) and the app
computes exact charges from it.

## Current rates (edit anytime in the Bill tab — no redeploy needed)

| Event | Rate |
|---|---|
| Yellow card | €1.00 |
| Red card | €10.00 |
| Missed penalty | €5.00 |
| Own goal | €10.00 |
| Assist | €2.00 |
| Brace (2+ goals in a gameweek) | €10.00 |
| Started, 0 minutes played | €5.00 |

Calibrated off real week-1 data across three teams to land around €250 per manager by
season's end, allowing for normal week-to-week swings.

## How it works

1. Anyone opens the link and lands straight on the league — no code, no login. Reading the
   bill needs nothing at all; you're only asked for a name when you go to log a gameweek,
   so charges land on the right manager.
2. Each gameweek, every manager opens their FPL Draft "Points" page, copies the full table
   (starting XI + substitutes), and pastes it into **This Gameweek**.
3. The app parses it exactly — no guessing — and logs charges for cards, missed pens, own
   goals, assists, braces, and starters who ended up playing 0 minutes (including ones who
   got auto-subbed out, which FPL Draft lists a bit confusingly — see note below).
4. Re-pasting the same gameweek replaces its charges rather than stacking them, so it's safe
   to redo if something looked off.
5. The Bill tab shows a running total per manager, tap through for a per-player breakdown,
   and a full receipt of every charge.

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
- No login and no room code means no access control — anyone with the link can read the
  bill, log gameweeks or edit rates. The Supabase policies in `supabase/schema.sql` are open to the anon key to match,
  so anyone who reads the app's JavaScript can reach the data directly. Reasonable for a
  closed friend group sharing one link; don't put anything sensitive in there.
- Editing a rate only affects gameweeks logged afterwards. Charges keep the price they were
  logged at — re-paste a gameweek to re-price it.

