"use client";
import { useState } from "react";
import { Manager, BillCharge } from "@/lib/supabase";
import { formatCents } from "@/lib/rates";
import { EVENT_LABEL } from "@/lib/events";
import { gameweeksIn, filterByWeek, WeekFilter as Week } from "@/lib/useLeague";
import WeekFilter from "./WeekFilter";
import TeamDetail from "./TeamDetail";

const RECEIPT_LIMIT = 40;

export default function BillView({
  managers,
  charges,
}: {
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
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-2xl font-semibold">
          {week === "all" ? "The bill" : `Gameweek ${week}`}
        </h2>
        <span className="mono text-sm" style={{ color: "var(--ink-soft)" }}>
          pot {formatCents(potTotal)}
        </span>
      </div>

      <WeekFilter weeks={weeks} value={week} onChange={setWeek} />

      {managers.length === 0 && (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          No teams yet — they get added in the Admin tab.
        </p>
      )}

      <div className="mb-8">
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

      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        {week === "all" ? "Latest charges" : `GW${week} charges`}
      </h3>
      <div className="receipt">
        {shown.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Nothing logged yet.</p>
        )}
        {shown.slice(0, RECEIPT_LIMIT).map((c) => {
          const m = managers.find((x) => x.id === c.manager_id);
          return (
            <div key={c.id} className="receipt-row">
              <span>
                {m?.name} — {c.player_name} · {EVENT_LABEL[c.event_type] ?? c.event_type}{" "}
                {c.gw ? `(GW${c.gw})` : ""}
              </span>
              <span className="receipt-amt">{formatCents(c.amount_cents)}</span>
            </div>
          );
        })}
        {shown.length > RECEIPT_LIMIT && (
          <p className="text-xs pt-2" style={{ color: "var(--ink-soft)" }}>
            Showing {RECEIPT_LIMIT} of {shown.length} — open a team for its full receipt.
          </p>
        )}
      </div>
    </div>
  );
}
