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
};

const POS_SET = new Set(["GKP", "DEF", "MID", "FWD"]);

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

  for (const line of lines) {
    if (/^starters$/i.test(line)) {
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
      if (/^in\t?out$/i.test(line.replace(/\s+/g, ""))) continue;
      const cells = line.split("\t").map((c) => c.trim());
      if (cells.length >= 2 && cells[1]) {
        autoSubbedOutNames.add(cells[1]);
      }
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

    if (POS_SET.has(firstCell) && cells.length >= 11) {
      // This is the stats row.
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
        minutes: num(1),
        goals: num(2),
        assists: num(3),
        ownGoals: num(6),
        penaltiesMissed: num(8),
        yellowCards: num(9),
        redCards: num(10),
        autoSubbedOut: false, // filled in below once we've read the full autosubs block
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

  // Now that we've read the whole paste, mark anyone named in the Out column.
  for (const p of players) {
    if (autoSubbedOutNames.has(p.name)) {
      p.autoSubbedOut = true;
    }
  }

  if (players.length === 0) {
    warnings.push("Couldn't find any player rows — check you pasted the full points table, headers included.");
  }

  return { players, warnings };
}
