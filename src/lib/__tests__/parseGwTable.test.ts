import test from "node:test";
import assert from "node:assert/strict";
import { parseGwTable } from "../parseGwTable.ts";

// Mirrors the shape of a real FPL Draft "Points" page copy-paste: four lines per
// player (team, name, team+pos code, stats row), section headers, and a trailing
// automatic-substitutions block.
const HEADER = "Player\tPOS\tMP\tGS\tA\tCS\tGC\tOG\tPS\tPM\tYC\tRC\tBP\tTP";

function row(
  team: string,
  name: string,
  code: string,
  pos: string,
  stats: Partial<Record<"mp" | "gs" | "a" | "cs" | "gc" | "og" | "ps" | "pm" | "yc" | "rc", number>>
) {
  const s = { mp: 0, gs: 0, a: 0, cs: 0, gc: 0, og: 0, ps: 0, pm: 0, yc: 0, rc: 0, ...stats };
  return [
    team,
    name,
    code,
    [pos, s.mp, s.gs, s.a, s.cs, s.gc, s.og, s.ps, s.pm, s.yc, s.rc, 0, 0].join("\t"),
  ].join("\n");
}

const find = (players: ReturnType<typeof parseGwTable>["players"], name: string) => {
  const p = players.find((x) => x.name === name);
  assert.ok(p, `expected a parsed player named ${name}`);
  return p;
};

test("reads stats out of the right columns", () => {
  const { players } = parseGwTable(
    [
      "Starters",
      HEADER,
      row("Arsenal", "Saka", "ARSMID", "MID", { mp: 90, gs: 2, a: 1, yc: 1, og: 1, pm: 1, rc: 1 }),
    ].join("\n")
  );

  assert.equal(players.length, 1);
  const saka = find(players, "Saka");
  assert.equal(saka.team, "Arsenal");
  assert.equal(saka.position, "MID");
  assert.equal(saka.minutes, 90);
  assert.equal(saka.goals, 2);
  assert.equal(saka.assists, 1);
  assert.equal(saka.ownGoals, 1);
  assert.equal(saka.penaltiesMissed, 1);
  assert.equal(saka.yellowCards, 1);
  assert.equal(saka.redCards, 1);
  assert.equal(saka.started, true);
});

test("splits starters from substitutes", () => {
  const { players } = parseGwTable(
    [
      "Starters",
      HEADER,
      row("Arsenal", "Saka", "ARSMID", "MID", { mp: 90 }),
      "Substitutes",
      HEADER,
      row("Spurs", "Solanke", "TOTFWD", "FWD", { mp: 0 }),
    ].join("\n")
  );

  assert.equal(find(players, "Saka").started, true);
  assert.equal(find(players, "Solanke").started, false);
});

test("flags a starter who was auto-subbed off, even though the paste lists them as a substitute", () => {
  const { players, warnings } = parseGwTable(
    [
      "Starters",
      HEADER,
      row("Arsenal", "Saka", "ARSMID", "MID", { mp: 90 }),
      row("Spurs", "Solanke", "TOTFWD", "FWD", { mp: 62 }),
      "Substitutes",
      HEADER,
      row("Chelsea", "Palmer", "CHEMID", "MID", { mp: 0 }),
      "Automatic Substitutions",
      "In\tOut",
      "Solanke\tPalmer",
    ].join("\n")
  );

  const palmer = find(players, "Palmer");
  assert.equal(palmer.autoSubbedOut, true, "the player in the Out column started and blanked");
  assert.equal(find(players, "Solanke").autoSubbedIn, true, "the In column player came off the bench");
  assert.equal(find(players, "Saka").autoSubbedOut, false);
  assert.deepEqual(warnings, []);
});

test("matches auto-sub names across accents and casing", () => {
  const { players, warnings } = parseGwTable(
    [
      "Starters",
      HEADER,
      row("Arsenal", "Ødegaard", "ARSMID", "MID", { mp: 0 }),
      "Automatic Substitutions",
      "In\tOut",
      "Saka\todegaard",
    ].join("\n")
  );

  assert.equal(find(players, "Ødegaard").autoSubbedOut, true);
  assert.deepEqual(warnings, [], "a matched name should not warn");
});

test("warns when an Out name matches nothing, rather than silently undercharging", () => {
  const { warnings } = parseGwTable(
    [
      "Starters",
      HEADER,
      row("Arsenal", "Saka", "ARSMID", "MID", { mp: 90 }),
      "Automatic Substitutions",
      "In\tOut",
      "Someone\tNobodyInThisTable",
    ].join("\n")
  );

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /couldn.t be matched/i);
});

test("warns about truncated stat rows instead of dropping them silently", () => {
  const { players, warnings } = parseGwTable(
    ["Starters", HEADER, "Arsenal", "Saka", "ARSMID", "MID\t90\t1\t0"].join("\n")
  );

  assert.equal(players.length, 0);
  assert.ok(
    warnings.some((w) => /missing columns/i.test(w)),
    `expected a truncated-row warning, got ${JSON.stringify(warnings)}`
  );
});

test("ignores header rows, position codes and injury flags", () => {
  const { players } = parseGwTable(
    [
      "Starters",
      "Info\tPlayer\tPOS\tMP",
      "Arsenal",
      "25% chance of playing",
      "Saka",
      "ARSMID",
      ["MID", 90, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].join("\t"),
    ].join("\n")
  );

  assert.equal(players.length, 1);
  assert.equal(players[0].name, "Saka");
  assert.equal(players[0].team, "Arsenal");
});

test("reports a warning when nothing at all parses", () => {
  const { players, warnings } = parseGwTable("just some prose someone pasted by mistake");
  assert.equal(players.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /couldn't find any player rows/i);
});
