"use client";
import { useState } from "react";
import { Manager, BillCharge } from "@/lib/supabase";
import { formatCents } from "@/lib/rates";
import { EVENT_LABEL } from "@/lib/events";
import { gameweeksIn, filterByWeek, WeekFilter as Week } from "@/lib/useLeague";
import WeekFilter from "./WeekFilter";

export default function TeamDetail({
  manager,
  charges,
  onBack,
}: {
  manager: Manager;
  charges: BillCharge[];
  onBack: () => void;
}) {
  const [week, setWeek] = useState<Week>("all");

  const weeks = gameweeksIn(charges);
  const shown = filterByWeek(charges, week);
  const total = shown.reduce((s, c) => s + c.amount_cents, 0);

  // Per-player rollup for the selected week: what each player cost, and why.
  const byPlayer = new Map<string, { total: number; events: Record<string, number> }>();
  for (const c of shown) {
    const entry = byPlayer.get(c.player_name) ?? { total: 0, events: {} };
    entry.total += c.amount_cents;
    entry.events[c.event_type] = (entry.events[c.event_type] ?? 0) + 1;
    byPlayer.set(c.player_name, entry);
  }
  const players = [...byPlayer.entries()].sort((a, b) => b[1].total - a[1].total);

  return (
    <div>
      <button
        onClick={onBack}
        className="text-xs font-semibold uppercase tracking-wide mb-4"
        style={{ color: "var(--ink-soft)", background: "transparent", cursor: "pointer" }}
      >
        ← All teams
      </button>

      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-semibold">{manager.name}</h2>
        <div className="text-right">
          <span className="mono text-2xl font-bold block" style={{ color: "var(--money)" }}>
            {formatCents(total)}
          </span>
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {week === "all" ? "all weeks" : `GW${week}`}
          </span>
        </div>
      </div>

      <WeekFilter weeks={weeks} value={week} onChange={setWeek} />

      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        By player
      </h3>
      {players.length === 0 && (
        <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
          {week === "all" ? "Nothing logged yet." : `Nothing in GW${week}.`}
        </p>
      )}
      <div className="mb-8">
        {players.map(([name, info]) => (
          <div
            key={name}
            className="flex items-center justify-between px-3 py-2.5 mb-1.5"
            style={{ border: "1px solid var(--line)" }}
          >
            <span className="text-sm">
              <b>{name}</b>{" "}
              <span style={{ color: "var(--ink-soft)" }}>
                {Object.entries(info.events)
                  .map(([type, n]) => `${n > 1 ? n + "× " : ""}${EVENT_LABEL[type] ?? type}`)
                  .join(", ")}
              </span>
            </span>
            <span className="mono text-sm font-bold" style={{ color: "var(--money)" }}>
              {formatCents(info.total)}
            </span>
          </div>
        ))}
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        Receipt
      </h3>
      <div className="receipt">
        {shown.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Nothing logged yet.</p>
        )}
        {shown.map((c) => (
          <div key={c.id} className="receipt-row">
            <span>
              {c.player_name} · {EVENT_LABEL[c.event_type] ?? c.event_type}{" "}
              {c.gw ? `(GW${c.gw})` : ""}
            </span>
            <span className="receipt-amt">{formatCents(c.amount_cents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
