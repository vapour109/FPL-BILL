import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RATES, RATE_KEYS, RATE_LABELS, normalizeRates, formatCents } from "../rates.ts";

test("every rate key has a default and a label", () => {
  for (const key of RATE_KEYS) {
    assert.equal(typeof DEFAULT_RATES[key], "number", `missing default for ${key}`);
    assert.equal(typeof RATE_LABELS[key], "string", `missing label for ${key}`);
  }
});

test("fills in rates for a room whose bill_rates is null or empty", () => {
  assert.deepEqual(normalizeRates(null), DEFAULT_RATES);
  assert.deepEqual(normalizeRates(undefined), DEFAULT_RATES);
  assert.deepEqual(normalizeRates({}), DEFAULT_RATES);
});

test("keeps stored rates but backfills keys added in a later release", () => {
  const rates = normalizeRates({ yellow: 250 });
  assert.equal(rates.yellow, 250);
  assert.equal(rates.red, DEFAULT_RATES.red);
});

test("rejects junk values rather than letting NaN reach a charge", () => {
  // The bug this guards: `count * undefined` produced NaN amount_cents.
  const rates = normalizeRates({ yellow: "lots", red: NaN, assist: -5, brace: null });
  assert.equal(rates.yellow, DEFAULT_RATES.yellow);
  assert.equal(rates.red, DEFAULT_RATES.red);
  assert.equal(rates.assist, DEFAULT_RATES.assist);
  assert.equal(rates.brace, DEFAULT_RATES.brace);
  for (const key of RATE_KEYS) assert.ok(Number.isFinite(rates[key]));
});

test("zero is a legitimate rate", () => {
  assert.equal(normalizeRates({ assist: 0 }).assist, 0);
});

test("formats cents as euros", () => {
  assert.equal(formatCents(0), "€0.00");
  assert.equal(formatCents(250), "€2.50");
  assert.equal(formatCents(1000), "€10.00");
});
