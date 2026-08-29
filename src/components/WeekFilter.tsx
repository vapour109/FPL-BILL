"use client";
import { WeekFilter as Week } from "@/lib/useLeague";

// Shared week picker: "All weeks" plus a chip per gameweek that has charges.
export default function WeekFilter({
  weeks,
  value,
  onChange,
  allLabel = "All weeks",
}: {
  weeks: number[];
  value: Week;
  onChange: (w: Week) => void;
  allLabel?: string;
}) {
  if (weeks.length === 0) return null;

  const chip = (active: boolean) => ({
    border: `1px solid ${active ? "var(--ink)" : "var(--line)"}`,
    background: active ? "var(--ink)" : "transparent",
    color: active ? "#fff" : "var(--ink-soft)",
    cursor: "pointer",
  });

  return (
    <div className="flex gap-1.5 flex-wrap mb-5">
      <button
        onClick={() => onChange("all")}
        className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
        style={chip(value === "all")}
      >
        {allLabel}
      </button>
      {weeks.map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide mono"
          style={chip(value === w)}
        >
          GW{w}
        </button>
      ))}
    </div>
  );
}
