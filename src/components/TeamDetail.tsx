"use client";
import { useState } from "react";
import { Manager, BillCharge } from "@/lib/supabase";
import { formatCents } from "@/lib/rates";
import { EVENT_LABEL } from "@/lib/events";
import { gameweeksIn, filterByWeek, WeekFilter as Week } from "@/lib/useLeague";
import { projectSeason, SEASON_WEEKS } from "@/lib/projection";
import WeekFilter from "./WeekFilter";

type PlayerRow = {
  name: string;
  total: number;
  items: BillCharge[];
};

export default function TeamDetail({
  manager,
  charges,
  weeksSoFar,
  onBack,
}: {
  manager: Manager;
  charges: BillCharge[];
  weeksSoFar: number;
  onBack: () => void;
}) {
  const [week, setWeek] = useState<Week>("all");
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);

  const weeks = gameweeksIn(charges);
  const shown = filterByWeek(charges, week);
  const total = shown.reduce((s, c) => s + c.amount_cents, 0);

  // One row per player: the name and its total, with the individual charges
  // held behind it and revealed on tap.
  const byPlayer = new Map<string, PlayerRow>();
  for (const c of shown) {
    const entry = byPlayer.get(c.player_name) ?? {
      name: c.player_name,
      total: 0,
      items: [],
    };
    entry.total += c.amount_cents;
    entry.items.push(c);
    byPlayer.set(c.player_name, entry);
  }
  const players = [...byPlayer.values()].sort((a, b) => b.total - a.total);

  return (
    <div>
      <button
        onClick={onBack}
        className="text-xs font-semibold uppercase tracking-wide mb-4"
        style={{ color: "var(--ink-soft)", background: "transparent", cursor: "pointer" }}
      >
        ← All teams
      </button>

      <div className="flex items-start justify-between gap-4 mb-5">
        <h2 className="text-2xl font-semibold">{manager.name}</h2>
        <div className="text-right shrink-0">
          <span className="mono text-2xl font-bold block" style={{ color: "var(--money)" }}>
            {formatCents(total)}
          </span>
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {week === "all" ? "all weeks" : `GW${week}`}
          </span>
        </div>
      </div>

      <WeekFilter weeks={weeks} value={week} onChange={setWeek} />

      <SeasonProjection charges={charges} weeksSoFar={weeksSoFar} />

      {players.length === 0 && (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {week === "all" ? "Nothing logged yet." : `Nothing in GW${week}.`}
        </p>
      )}

      <div>
        {players.map((p) => {
          const open = openPlayer === p.name;
          return (
            <div key={p.name} className="mb-1.5" style={{ border: "1px solid var(--line)" }}>
              <button
                onClick={() => setOpenPlayer(open ? null : p.name)}
                aria-expanded={open}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                style={{ background: "transparent", cursor: "pointer" }}
              >
                <span className="text-sm font-semibold">{p.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="mono text-sm font-bold" style={{ color: "var(--money)" }}>
                    {formatCents(p.total)}
                  </span>
                  <span
                    aria-hidden
                    className="text-xs"
                    style={{
                      color: "var(--ink-soft)",
                      transform: open ? "rotate(180deg)" : "none",
                      display: "inline-block",
                    }}
                  >
                    ▾
                  </span>
                </span>
              </button>

              {open && (
                <div className="px-3 pb-2.5" style={{ borderTop: "1px dotted var(--line)" }}>
                  {p.items.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 py-1.5 text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      <span>
                        {EVENT_LABEL[c.event_type] ?? c.event_type}
                        {c.gw ? ` · GW${c.gw}` : ""}
                      </span>
                      <span className="mono shrink-0" style={{ color: "var(--money)" }}>
                        {formatCents(c.amount_cents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Straight-line projection off the pace so far. Deliberately uses every week
// logged rather than the selected filter — it answers "where does this end up",
// which the filter shouldn't change.
function SeasonProjection({ charges, weeksSoFar }: { charges: BillCharge[]; weeksSoFar: number }) {
  const seasonTotal = charges.reduce((s, c) => s + c.amount_cents, 0);
  const projected = projectSeason(seasonTotal, weeksSoFar);
  if (projected === null) return null;

  return (
    <div className="px-3 py-2.5 mb-5" style={{ border: "1px solid var(--line)" }}>
      <div className="text-sm">
        On track for{" "}
        <span className="mono font-bold" style={{ color: "var(--money)" }}>
          {formatCents(projected)}
        </span>{" "}
        by GW{SEASON_WEEKS}
      </div>
      <div className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
        at {formatCents(seasonTotal)} over {weeksSoFar} week{weeksSoFar === 1 ? "" : "s"}
      </div>
    </div>
  );
}
