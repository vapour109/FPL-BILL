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

1. Anyone opens the app and enters a room code — same code puts everyone in the same room.
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

## Already set up for you

A Supabase project (`fpl-the-bill`) is live with the schema applied — `.env.local` in this
project has its URL and key filled in, so it works locally out of the box. No other services,
API keys, or accounts are needed.

## Run locally

```
npm install
npm run dev
```

## Deploy to Vercel

1. Push this folder to a new GitHub repo
2. Go to vercel.com → New Project → import that repo
3. Add the two env vars from `.env.local` (Project Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy — you'll get a public URL, share it with your league

## Notes / honest limitations

- **Fouls** aren't in the FPL Points table at all, so they're not billable.
- Each manager must paste their own gameweek table — nothing is pulled automatically, since
  that data lives behind your FPL Draft login and the public API can't see it.
- Charges are computed from whatever's pasted, in good faith — there's no cryptographic
  verification that a paste is genuine. Fine for a friend group, not audit-proof.
- No login means no access control — anyone with the room link can log gameweeks or edit
  rates. Reasonable for a closed friend group sharing one link.

