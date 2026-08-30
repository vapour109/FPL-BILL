// Single source of truth for the billable events and their default prices.
// Both the API route (which computes charges) and the Bill tab (which renders
// the rate editor) read from here, so the two can't drift apart.

export const RATE_KEYS = [
  "yellow",
  "red",
  "missedPen",
  "ownGoal",
  "assist",
  "brace",
  "zeroMinStarter",
] as const;

export type RateKey = (typeof RATE_KEYS)[number];
export type Rates = Record<RateKey, number>;

// Amounts in cents. A flat €5 for the serious offences — red card, missed
// penalty, own goal, brace, and starting a player who plays no minutes — with
// the cheaper events scaled to 75% of their original calibration.
export const DEFAULT_RATES: Rates = {
  yellow: 75,
  red: 500,
  missedPen: 500,
  ownGoal: 500,
  assist: 150,
  brace: 500,
  zeroMinStarter: 500,
};

export const RATE_LABELS: Record<RateKey, string> = {
  yellow: "Yellow card",
  red: "Red card",
  missedPen: "Missed penalty",
  ownGoal: "Own goal",
  assist: "Assist",
  brace: "Brace (2+ goals)",
  zeroMinStarter: "Started, 0 mins",
};

// A room's bill_rates column may be null (row created before the default landed),
// missing keys (rates added in a later release), or hold junk from a bad edit.
// Fill the gaps rather than letting `undefined` reach the arithmetic and turn a
// charge into NaN.
export function normalizeRates(raw: unknown): Rates {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_RATES };
  for (const key of RATE_KEYS) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      out[key] = Math.round(value);
    }
  }
  return out;
}

export const formatCents = (cents: number) => `€${(cents / 100).toFixed(2)}`;

// Price of a pint, for showing the pot in beers. Editable per room.
export const DEFAULT_BEER_PRICE_CENTS = 600;

export function beerPrice(cents: number | null | undefined): number {
  return typeof cents === "number" && Number.isFinite(cents) && cents > 0
    ? cents
    : DEFAULT_BEER_PRICE_CENTS;
}

// Rounded to one decimal, since "9.4 pints" reads better than "9.375".
export function pintsFor(potCents: number, priceCents: number): number {
  return Math.round((potCents / priceCents) * 10) / 10;
}
