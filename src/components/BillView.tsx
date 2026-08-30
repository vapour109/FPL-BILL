"use client";
import { useState } from "react";
import { Room, Manager, BillCharge } from "@/lib/supabase";
import { formatCents, beerPrice, pintsFor } from "@/lib/rates";
import { gameweeksIn, filterByWeek, WeekFilter as Week } from "@/lib/useLeague";
import WeekFilter from "./WeekFilter";
import TeamDetail from "./TeamDetail";

export default function BillView({
  room,
  managers,
  charges,
}: {
  room: Room;
  managers: Manager[];
  charges: BillCharge[];
}) {
  const [week, setWeek] = useState<Week>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Kept as an id rather than the object so the selection survives a poll
  // refreshing the manager list (e.g. after a rename in the admin tab).
  const selected = managers.find((m) => m.id === selectedId) ?? null;
  if (selected) {
    return (
      <TeamDetail
        manager={selected}
        charges={charges.filter((c) => c.manager_id === selected.id)}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const weeks = gameweeksIn(charges);
  const shown = filterByWeek(charges, week);

  const totals = new Map<string, number>();
  for (const c of shown) totals.set(c.manager_id, (totals.get(c.manager_id) ?? 0) + c.amount_cents);

  const ranked = [...managers].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
  const leaderAmt = ranked.length ? totals.get(ranked[0].id) ?? 0 : 0;
  const potTotal = shown.reduce((s, c) => s + c.amount_cents, 0);

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-5">
        {week === "all" ? "The bill" : `Gameweek ${week}`}
      </h2>

      <WeekFilter weeks={weeks} value={week} onChange={setWeek} />

      {/* The pot is the headline number, so it leads the page rather than
          sitting as a footnote beside the title. */}
      <div
        className="text-center px-4 py-6 mb-6"
        style={{ background: "var(--money)", color: "#fff" }}
      >
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ opacity: 0.75 }}>
          {week === "all" ? "Total pot" : `GW${week} pot`}
        </div>
        <div className="mono font-bold leading-none" style={{ fontSize: "2.75rem" }}>
          {formatCents(potTotal)}
        </div>
      </div>

      {managers.length === 0 && (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          No teams yet — they get added in the Admin tab.
        </p>
      )}

      <div>
        {ranked.map((m, i) => {
          const amt = totals.get(m.id) ?? 0;
          const isLeader = amt === leaderAmt && leaderAmt > 0;
          return (
            <button
              key={m.id}
              onClick={() => setSelectedId(m.id)}
              className="w-full flex items-center justify-between px-3 py-3 mb-2 text-left"
              style={{
                border: `1px solid ${isLeader ? "var(--money)" : "var(--line)"}`,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <span className="flex items-baseline gap-2.5">
                <span className="mono text-xs" style={{ color: "var(--ink-soft)" }}>
                  {i + 1}
                </span>
                <span className="text-sm font-semibold">{m.name}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="mono text-base font-bold" style={{ color: "var(--money)" }}>
                  {formatCents(amt)}
                </span>
                <span style={{ color: "var(--ink-soft)" }}>→</span>
              </span>
            </button>
          );
        })}
      </div>

      <BeerPot potCents={potTotal} priceCents={beerPrice(room.beer_price_cents)} />
    </div>
  );
}

// The pot restated in the unit it will actually be spent in.
function BeerPot({ potCents, priceCents }: { potCents: number; priceCents: number }) {
  if (potCents <= 0) return null;
  const pints = pintsFor(potCents, priceCents);
  return (
    <div
      className="flex items-center justify-center gap-2.5 px-4 py-4 mt-8"
      style={{ border: "1px solid var(--line)", background: "var(--paper)" }}
    >
      <span aria-hidden className="text-2xl leading-none">🍺</span>
      <span className="text-sm font-semibold">
        <span className="mono" style={{ color: "var(--money)" }}>{pints}</span>{" "}
        {pints === 1 ? "pint" : "pints"} in the pot
      </span>
    </div>
  );
}
