"use client";
import { useState } from "react";
import { useLeague } from "@/lib/useLeague";
import { useAdminUnlocked } from "@/lib/admin";
import BillView from "@/components/BillView";
import AdminPanel from "@/components/AdminPanel";

type Tab = "bill" | "admin";

export default function LeaguePage() {
  const { room, managers, charges, error, reload } = useLeague();
  const [tab, setTab] = useState<Tab>("bill");
  const unlocked = useAdminUnlocked();

  if (!room) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6 text-center text-sm"
        style={{ color: "var(--ink-soft)" }}
      >
        <div>
          <p>{error ? "Couldn't load the league." : "Loading…"}</p>
          {error && <p className="mt-2" style={{ color: "var(--alert)" }}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5"
            style={{ background: "var(--electric)", transform: "rotate(45deg)" }}
          />
          <h1 className="text-sm font-semibold uppercase tracking-widest">The Bill</h1>
        </div>
      </div>

      <div className="flex" style={{ borderBottom: "1px solid var(--line)" }}>
        {([
          ["bill", "The Bill"],
          ["admin", "Admin"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2.5 text-xs font-semibold uppercase tracking-widest"
            style={{
              color: tab === key ? "var(--ink)" : "var(--ink-soft)",
              borderBottom: tab === key ? "2px solid var(--money)" : "2px solid transparent",
              marginBottom: "-1px",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="max-w-3xl mx-auto px-5 py-6">
        {error && <p className="text-sm mb-4" style={{ color: "var(--alert)" }}>{error}</p>}
        {tab === "bill" && <BillView room={room} managers={managers} charges={charges} />}
        {tab === "admin" && (
          <AdminPanel
            room={room}
            managers={managers}
            unlocked={unlocked}
            onChange={reload}
          />
        )}
      </div>
    </div>
  );
}
