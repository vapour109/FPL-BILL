// Parses the tab-separated gameweek points table copied straight from the
// FPL Draft "Points" page. Deterministic — no AI involved, so it's exact.
//
// Expected shape per player, across 4 lines:
//   Team name           e.g. "Man Utd"
//   Player name         e.g. "Lammens"
//   Team+Position code  e.g. "MUNGKP"   (discarded, used only to sanity check)
//   Tab-separated stats  starting with POS, then MP, GS, A, CS, GC, OG, PS, PM, YC, RC, ...
//
// A line reading exactly "Substitutes" marks the split between the starting XI
// and the bench for the rest of the paste — but note that section already reflects
// automatic substitutions having been applied. An "Automatic Substitutions" block at
// the end (In / Out name pairs) names the ORIGINAL starter who got 0 minutes in the
// "Out" column — that's who the manager actually picked, and they're the one who
// should be charged, even though the paste itself now lists them under "Substitutes".
// The "In" column names the bench player who replaced them; they're listed under
// "Starters" but must NOT be charged as a blanking starter, since the manager
// didn't pick them to start.

export type ParsedPlayer = {
  name: string;
  team: string;
  position: "GKP" | "DEF" | "MID" | "FWD";
  started: boolean;
  minutes: number;
  goals: number;
  assists: number;
  ownGoals: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  autoSubbedOut: boolean;
  autoSubbedIn: boolean;
};

const POS_SET = new Set(["GKP", "DEF", "MID", "FWD"]);

// Column offsets within the stats row, counting the POS cell as index 0.
// Kept as a named map so the mapping is auditable against the header row above.
const COL = {
  minutes: 1,
  goals: 2,
  assists: 3,
  cleanSheets: 4,
  goalsConceded: 5,
  ownGoals: 6,
  penaltiesSaved: 7,
  penaltiesMissed: 8,
  yellowCards: 9,
  redCards: 10,
} as const;

const MIN_STAT_CELLS = COL.redCards + 1;

// Player names travel through two different parts of the paste (the table and the
// auto-substitutions block) and don't always arrive spelled identically — accents
// and casing in particular. Compare on a folded form so a genuine match isn't missed;
// a missed match silently undercharges, which is the worst failure mode here.
// NFD splits accented letters into base + combining mark, but a handful of Latin
// letters common in football names are single code points with no decomposition
// (Ødegaard, Bruno Fernandes' D-with-stroke spellings, Łukasz, Weiß). Without these
// the stripping step would delete the letter entirely and the name would never match.
const LETTER_FOLDS: Record<string, string> = {
  ø: "o",
  đ: "d",
  ð: "d",
  ł: "l",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  þ: "th",
  ħ: "h",
  ı: "i",
};

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u00e0-\u024f]/g, (ch) => LETTER_FOLDS[ch] ?? ch)
    .replace(/[^a-z0-9]/g, "");
}

export function parseGwTable(raw: string): { players: ParsedPlayer[]; warnings: string[] } {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const players: ParsedPlayer[] = [];
  const warnings: string[] = [];
  let section: "starting" | "substitutes" | "autosubs" = "starting";
  let pending: string[] = [];
  const autoSubbedOutNames = new Set<string>();
  const autoSubbedInNames = new Set<string>();
  let malformedStatRows = 0;

  for (const line of lines) {
    if (/^starters$/i.test(line)) {
      section = "starting";
      pending = [];
      continue;
    }
    if (/^substitutes$/i.test(line)) {
      section = "substitutes";
      pending = [];
      continue;
    }
    if (/^automatic substitutions$/i.test(line)) {
      section = "autosubs";
      pending = [];
      continue;
    }

    if (section === "autosubs") {
      // Expect an "In\tOut" header line, then "PlayerIn\tPlayerOut" rows.
      if (/^inout$/i.test(line.replace(/\s+/g, ""))) continue;
      const cells = line.split("\t").map((c) => c.trim());
      if (cells.length >= 2 && cells[0]) autoSubbedInNames.add(normalizeName(cells[0]));
      if (cells.length >= 2 && cells[1]) autoSubbedOutNames.add(normalizeName(cells[1]));
      continue;
    }

    if (/chance of playing/i.test(line)) {
      // Injury/rotation-risk flag text that sometimes sits inline in the table — not a team or player line.
      continue;
    }
    // Header rows (appear once at the top, and again above the substitutes block)
    if (/^(info\t)?player\t/i.test(line) || /^info$/i.test(line)) {
      pending = [];
      continue;
    }

    const cells = line.split("\t").map((c) => c.trim());
    const firstCell = cells[0]?.toUpperCase();

    if (POS_SET.has(firstCell)) {
      if (cells.length < MIN_STAT_CELLS) {
        // A stats row we recognised but can't read to the end. Silently dropping it
        // would quietly undercharge, so count it and warn.
        malformedStatRows++;
        pending = [];
        continue;
      }
      const name = pending[pending.length - 1] ?? "Unknown";
      const team = pending[pending.length - 2] ?? "";
      const num = (i: number) => {
        const v = parseFloat(cells[i]);
        return isNaN(v) ? 0 : v;
      };
      players.push({
        name,
        team,
        position: firstCell as ParsedPlayer["position"],
        started: section === "starting",
        minutes: num(COL.minutes),
        goals: num(COL.goals),
        assists: num(COL.assists),
        ownGoals: num(COL.ownGoals),
        penaltiesMissed: num(COL.penaltiesMissed),
        yellowCards: num(COL.yellowCards),
        redCards: num(COL.redCards),
        // Both filled in below, once we've read the full autosubs block.
        autoSubbedOut: false,
        autoSubbedIn: false,
      });
      pending = [];
    } else {
      // Team name, player name, or the team+pos code line — just accumulate.
      if (/^[A-Z]{2,}(GKP|DEF|MID|FWD)$/.test(line)) {
        continue;
      }
      pending.push(line);
      if (pending.length > 3) pending.shift();
    }
  }

  // Now that we've read the whole paste, resolve the auto-substitution names.
  const matchedOut = new Set<string>();
  for (const p of players) {
    const key = normalizeName(p.name);
    if (autoSubbedOutNames.has(key)) {
      p.autoSubbedOut = true;
      matchedOut.add(key);
    }
    if (autoSubbedInNames.has(key)) {
      p.autoSubbedIn = true;
    }
  }

  if (players.length === 0) {
    warnings.push("Couldn't find any player rows — check you pasted the full points table, headers included.");
  }
  if (malformedStatRows > 0) {
    warnings.push(
      `Skipped ${malformedStatRows} stat row${malformedStatRows === 1 ? "" : "s"} with missing columns — ` +
        "copy the whole table, all the way across to the red-cards column."
    );
  }
  // An unmatched "Out" name means a starter who blanked went uncharged. Say so
  // rather than quietly producing a smaller bill.
  const unmatchedOut = [...autoSubbedOutNames].filter((n) => !matchedOut.has(n));
  if (unmatchedOut.length > 0) {
    warnings.push(
      `${unmatchedOut.length} player${unmatchedOut.length === 1 ? "" : "s"} named in the ` +
        "Automatic Substitutions “Out” column couldn't be matched to a row in the table — " +
        "they may not have been charged for blanking."
    );
  }

  return { players, warnings };
}
