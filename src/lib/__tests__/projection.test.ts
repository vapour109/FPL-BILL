import test from "node:test";
import assert from "node:assert/strict";
import { projectSeason, weeksEntered, SEASON_WEEKS } from "../projection.ts";
import type { Room, BillCharge } from "../supabase.ts";

const charge = (gw: number | null): BillCharge =>
  ({ gw, amount_cents: 100 }) as BillCharge;
const room = (synced: number[] | null): Room => ({ synced_gws: synced }) as Room;

test("projects a full season off the pace so far", () => {
  // €10 over one week -> €10 x 38.
  assert.equal(projectSeason(1000, 1), 1000 * SEASON_WEEKS);
  // €30 over three weeks is €10 a week.
  assert.equal(projectSeason(3000, 3), 1000 * SEASON_WEEKS);
});

test("rounds to whole cents rather than leaking fractions into a total", () => {
  // 2675 / 3 * 38 = 33883.33...
  assert.equal(projectSeason(2675, 3), 33883);
  assert.ok(Number.isInteger(projectSeason(2675, 3)!));
});

test("a full season of data projects to exactly what was spent", () => {
  assert.equal(projectSeason(50000, SEASON_WEEKS), 50000);
});

test("returns null when there is nothing to extrapolate from", () => {
  assert.equal(projectSeason(1000, 0), null);
  assert.equal(projectSeason(1000, -1), null);
  assert.equal(projectSeason(1000, NaN), null);
});

test("zero owed projects to zero, not null", () => {
  assert.equal(projectSeason(0, 2), 0);
});

test("counts weeks from the room's synced gameweeks", () => {
  assert.equal(weeksEntered(room([1, 2, 3]), []), 3);
});

test("a clean week still counts, so the run rate isn't flattered", () => {
  // GW2 is logged but produced no charges for anyone; it must still divide.
  const charges = [charge(1), charge(1)];
  assert.equal(weeksEntered(room([1, 2]), charges), 2);
});

test("falls back to the gameweeks present in charges", () => {
  assert.equal(weeksEntered(room(null), [charge(1), charge(1), charge(4)]), 2);
  assert.equal(weeksEntered(room([]), [charge(7)]), 1);
});

test("ignores charges with no gameweek in the fallback", () => {
  assert.equal(weeksEntered(room(null), [charge(null), charge(2)]), 1);
});

test("no data at all means no projection", () => {
  assert.equal(weeksEntered(room(null), []), 0);
  assert.equal(projectSeason(0, weeksEntered(room(null), [])), null);
});
