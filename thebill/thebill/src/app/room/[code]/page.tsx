"use client";
import { useEffect, useState, useCallback, use as useUnwrap } from "react";
import { supabase, Room, Manager, RosterPlayer, BillCharge } from "@/lib/supabase";
import { parseGwTable } from "@/lib/parseGwTable";

const POS_LABEL: Record<number, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = useUnwrap(params);
  const roomCode = code.toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [charges, setCharges] = useState<BillCharge[]>([]);
  const [myName, setMyName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [tab, setTab] = useState<"roster" | "bill">("roster");

  useEffect(() => {
    const saved = localStorage.getItem(`thebill_name_${roomCode}`);
    if (saved) setMyName(saved);
  }, [roomCode]);

  const load = useCallback(async () => {
    const { data: r } = await supabase.from("rooms").select("*").eq("code", roomCode).maybeSingle();
    if (!r) return;
    setRoom(r);
    const { data: ms } = await supabase.from("managers").select("*").eq("room_id", r.id).order("created_at");
    setManagers(ms ?? []);
    const managerIds = (ms ?? []).map((m) => m.id);
    if (managerIds.length) {
      const { data: rp } = await supabase.from("roster_players").select("*").in("manager_id", managerIds);
      setRoster(rp ?? []);
      const { data: bc } = await supabase
        .from("bill_charges")
        .select("*")
        .eq("room_id", r.id)
        .order("created_at", { ascending: false });
      setCharges(bc ?? []);
    }
  }, [roomCode]);

  useEffect(() => {
    fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: roomCode }),
    }).then(load);
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [roomCode, load]);

  async function joinAs(name: string) {
    if (!room || !name.trim()) return;
    const trimmed = name.trim();
    localStorage.setItem(`thebill_name_${roomCode}`, trimmed);
    setMyName(trimmed);
    const { data: existing } = await supabase
      .from("managers")
      .select("*")
      .eq("room_id", room.id)
      .eq("name", trimmed)
      .maybeSingle();
    if (!existing) {
      await supabase.from("managers").insert({ room_id: room.id, name: trimmed });
    }
    load();
  }

  if (!room) {
    return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: "var(--ink-soft)" }}>Loading room…</div>;
  }

  if (!myName) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-sm w-full">
          <h2 className="text-2xl font-semibold mb-2">Room {roomCode}</h2>
          <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>What's your name?</p>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinAs(nameInput)}
            className="w-full px-3 py-3 mb-4 text-base outline-none"
            style={{ border: "1px solid var(--line)" }}
            placeholder="Your name"
          />
          <button
            onClick={() => joinAs(nameInput)}
            className="w-full py-3 text-sm font-semibold uppercase tracking-wide text-white"
            style={{ background: "var(--ink)" }}
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  const me = managers.find((m) => m.name === myName);

  return (
    <div className="min-h-screen">
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5" style={{ background: "var(--money)", transform: "rotate(45deg)" }} />
          <h1 className="text-sm font-semibold uppercase tracking-widest">The Bill</h1>
        </div>
        <div className="text-xs uppercase tracking-widest mono px-2 py-1" style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}>
          Room {roomCode} · {myName}
        </div>
      </div>

      <div className="flex" style={{ borderBottom: "1px solid var(--line)" }}>
        {(["roster", "bill"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2.5 text-xs font-semibold uppercase tracking-widest"
            style={{
              color: tab === t ? "var(--ink)" : "var(--ink-soft)",
              borderBottom: tab === t ? "2px solid var(--money)" : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {t === "roster" ? "This Gameweek" : "The Bill"}
          </button>
        ))}
      </div>

      <div className="max-w-3xl mx-auto px-5 py-6">
        {tab === "roster" && me && <RosterTab room={room} manager={me} roster={roster.filter((r) => r.manager_id === me.id)} managers={managers} roster_all={roster} onChange={load} />}
        {tab === "bill" && <BillTab room={room} managers={managers} charges={charges} onChange={load} />}
      </div>
    </div>
  );
}

function RosterTab({
  room,
  manager,
  roster,
  managers,
  roster_all,
  onChange,
}: {
  room: Room;
  manager: Manager;
  roster: RosterPlayer[];
  managers: Manager[];
  roster_all: RosterPlayer[];
  onChange: () => void;
}) {
  const [gw, setGw] = useState(1);
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof parseGwTable> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function onParse() {
    setErr("");
    setMsg("");
    if (!raw.trim()) {
      setErr("Paste your gameweek points table first.");
      return;
    }
    const result = parseGwTable(raw);
    if (result.players.length === 0) {
      setErr(result.warnings[0] ?? "Couldn't read any players from that paste.");
      setPreview(null);
      return;
    }
    setPreview(result);
  }

  async function onSubmit() {
    setSubmitting(true);
    setErr("");
    setMsg("");
    const res = await fetch("/api/gameweek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: room.id, managerId: manager.id, gw, raw }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (data.error) {
      setErr(data.error);
      return;
    }
    setMsg(`GW${gw} logged — ${data.chargesAdded} charge${data.chargesAdded === 1 ? "" : "s"} from ${data.playersParsed} players.`);
    setPreview(null);
    setRaw("");
    onChange();
  }

  return (
    <div>
      <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
        On the FPL Draft site, open your team's <b>Points</b> page for this gameweek and copy the whole table
        (starting XI and substitutes) — then paste it below. This is read exactly, no guessing: minutes, cards,
        goals and own goals all come straight from what you paste.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm" style={{ color: "var(--ink-soft)" }}>Gameweek</span>
        <input
          type="number"
          min={1}
          max={38}
          value={gw}
          onChange={(e) => setGw(parseInt(e.target.value) || 1)}
          className="w-16 px-2 py-1.5 text-sm outline-none"
          style={{ border: "1px solid var(--line)" }}
        />
      </div>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Paste the points table here…"
        rows={8}
        className="w-full px-3 py-3 mb-3 text-xs mono outline-none"
        style={{ border: "1px solid var(--line)" }}
      />

      <button
        onClick={onParse}
        className="w-full py-2.5 mb-2 text-sm font-semibold uppercase tracking-wide"
        style={{ border: "1px solid var(--ink)", color: "var(--ink)" }}
      >
        Preview
      </button>
      {err && <p className="text-sm mb-3" style={{ color: "var(--money)" }}>{err}</p>}
      {msg && <p className="text-sm mb-3" style={{ color: "var(--good)" }}>{msg}</p>}

      {preview && (
        <div className="mb-8" style={{ border: "1px solid var(--line)" }}>
          {preview.players.map((p, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 text-sm" style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <span>
                <span
                  className="inline-block w-5 text-center text-[10px] font-bold text-white mr-2"
                  style={{ background: p.started ? "var(--ink)" : "var(--ink-soft)", padding: "2px 0" }}
                >
                  {p.position[0]}
                </span>
                {p.name} <span style={{ color: "var(--ink-soft)" }}>({p.team}) {p.autoSubbedOut ? "· started, auto-subbed off" : p.started ? "" : "· bench"}</span>
              </span>
              <span className="text-xs mono" style={{ color: "var(--ink-soft)" }}>
                {p.minutes}′{p.autoSubbedOut ? " · didn't play, charged" : ""}{p.goals ? ` · ${p.goals}g` : ""}{p.assists ? ` · ${p.assists}a` : ""}{p.yellowCards ? " · YC" : ""}{p.redCards ? " · RC" : ""}
                {p.ownGoals ? " · OG" : ""}{p.penaltiesMissed ? " · missed pen" : ""}
              </span>
            </div>
          ))}
          <div className="p-3">
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="w-full py-2.5 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-40"
              style={{ background: "var(--money)" }}
            >
              {submitting ? "Logging…" : `Log GW${gw} charges`}
            </button>
          </div>
        </div>
      )}

      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        Your squad (from last paste)
      </h3>
      {roster.length === 0 && <p className="text-sm" style={{ color: "var(--ink-soft)" }}>No gameweek logged yet.</p>}
      {[1, 2, 3, 4].map((pos) =>
        roster
          .filter((p) => p.position === pos)
          .map((p) => (
            <div key={p.id} className="flex items-center py-2 text-sm" style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <span
                className="inline-block w-5 text-center text-[10px] font-bold text-white mr-2"
                style={{ background: "var(--ink-soft)", padding: "2px 0" }}
              >
                {POS_LABEL[pos][0]}
              </span>
              {p.player_name} <span className="ml-1" style={{ color: "var(--ink-soft)" }}>({p.team_short})</span>
            </div>
          ))
      )}

      <h3 className="text-xs font-semibold uppercase tracking-widest mt-8 mb-3" style={{ color: "var(--ink-soft)" }}>
        Other managers
      </h3>
      {managers
        .filter((m) => m.id !== manager.id)
        .map((m) => (
          <div key={m.id} className="flex items-center justify-between py-2 text-sm" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <span>{m.name}</span>
            <span className="mono text-xs" style={{ color: "var(--ink-soft)" }}>
              {roster_all.filter((r) => r.manager_id === m.id).length} players logged
            </span>
          </div>
        ))}
    </div>
  );
}

function BillTab({
  room,
  managers,
  charges,
  onChange,
}: {
  room: Room;
  managers: Manager[];
  charges: BillCharge[];
  onChange: () => void;
}) {
  const [rates, setRates] = useState(room.bill_rates);
  const [selected, setSelected] = useState<Manager | null>(null);

  useEffect(() => setRates(room.bill_rates), [room.bill_rates]);

  async function saveRate(key: string, euros: string) {
    const cents = Math.round(parseFloat(euros) * 100);
    if (isNaN(cents) || cents < 0) return;
    const next = { ...rates, [key]: cents };
    setRates(next);
    await supabase.from("rooms").update({ bill_rates: next }).eq("id", room.id);
  }

  const totals = new Map<string, number>();
  for (const c of charges) totals.set(c.manager_id, (totals.get(c.manager_id) ?? 0) + c.amount_cents);
  const ranked = [...managers].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
  const leaderAmt = ranked.length ? totals.get(ranked[0].id) ?? 0 : 0;

  const fmt = (cents: number) => `€${(cents / 100).toFixed(2)}`;

  if (selected) {
    return (
      <TeamDetail
        manager={selected}
        charges={charges.filter((c) => c.manager_id === selected.id)}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div>
      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
        Cards, missed pens, own goals, braces and blanking starters — computed straight from what each manager
        pastes each gameweek. Fouls aren't in the FPL data at all, so they're excluded.
      </p>

      {room.synced_gws?.length > 0 && (
        <p className="text-xs mb-6" style={{ color: "var(--ink-soft)" }}>
          Gameweeks logged: {[...room.synced_gws].sort((a, b) => a - b).join(", ")}
        </p>
      )}

      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        Rates
      </h3>
      <div className="grid grid-cols-2 gap-2 mb-8">
        {[
          ["yellow", "Yellow card"],
          ["red", "Red card"],
          ["missedPen", "Missed penalty"],
          ["ownGoal", "Own goal"],
          ["brace", "Brace (2+ goals)"],
          ["assist", "Assist"],
          ["zeroMinStarter", "Started, 0 mins"],
        ].map(([key, label]) => (
          <div key={key} className="px-3 py-2" style={{ border: "1px solid var(--line)" }}>
            <label className="block text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>
              {label}
            </label>
            <input
              defaultValue={(rates[key] / 100).toFixed(2)}
              onBlur={(e) => saveRate(key, e.target.value)}
              className="mono text-sm w-full outline-none"
            />
          </div>
        ))}
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        Owed — tap a team for the breakdown
      </h3>
      <div className="mb-8">
        {ranked.length === 0 && <p className="text-sm" style={{ color: "var(--ink-soft)" }}>No managers yet.</p>}
        {ranked.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelected(m)}
            className="w-full flex items-center justify-between px-3 py-3 mb-2 text-left"
            style={{
              border: `1px solid ${(totals.get(m.id) ?? 0) === leaderAmt && leaderAmt > 0 ? "var(--money)" : "var(--line)"}`,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            <span className="text-sm font-semibold">{m.name}</span>
            <span className="flex items-center gap-2">
              <span className="mono text-base font-bold" style={{ color: "var(--money)" }}>
                {fmt(totals.get(m.id) ?? 0)}
              </span>
              <span style={{ color: "var(--ink-soft)" }}>→</span>
            </span>
          </button>
        ))}
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        The receipt
      </h3>
      <div className="receipt">
        {charges.length === 0 && <p className="text-sm" style={{ color: "var(--ink-soft)" }}>No charges yet — log a gameweek from "This Gameweek".</p>}
        {charges.slice(0, 60).map((c) => {
          const m = managers.find((x) => x.id === c.manager_id);
          return (
            <div key={c.id} className="receipt-row">
              <span>
                {m?.name} — {c.player_name} · {EVENT_LABEL[c.event_type] ?? c.event_type} {c.gw ? `(GW${c.gw})` : ""}
              </span>
              <span className="receipt-amt">{fmt(c.amount_cents)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  yellow_card: "yellow card",
  red_card: "red card",
  missed_penalty: "missed penalty",
  own_goal: "own goal",
  brace: "brace",
  assist: "assist",
  zero_min_starter: "started, 0 mins",
};

function TeamDetail({
  manager,
  charges,
  onBack,
}: {
  manager: Manager;
  charges: BillCharge[];
  onBack: () => void;
}) {
  const fmt = (cents: number) => `€${(cents / 100).toFixed(2)}`;
  const total = charges.reduce((s, c) => s + c.amount_cents, 0);

  // Per-player rollup: total owed and a breakdown of event counts, per player.
  const byPlayer = new Map<string, { total: number; events: Record<string, number> }>();
  for (const c of charges) {
    const entry = byPlayer.get(c.player_name) ?? { total: 0, events: {} };
    entry.total += c.amount_cents;
    entry.events[c.event_type] = (entry.events[c.event_type] ?? 0) + 1;
    byPlayer.set(c.player_name, entry);
  }
  const players = [...byPlayer.entries()].sort((a, b) => b[1].total - a[1].total);

  // Per-gameweek rollup, for a quick "which week hurt" view.
  const byGw = new Map<number, number>();
  for (const c of charges) {
    if (c.gw != null) byGw.set(c.gw, (byGw.get(c.gw) ?? 0) + c.amount_cents);
  }
  const gws = [...byGw.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div>
      <button
        onClick={onBack}
        className="text-xs font-semibold uppercase tracking-wide mb-4"
        style={{ color: "var(--ink-soft)" }}
      >
        ← All teams
      </button>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">{manager.name}</h2>
        <span className="mono text-2xl font-bold" style={{ color: "var(--money)" }}>{fmt(total)}</span>
      </div>

      {gws.length > 0 && (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
            By gameweek
          </h3>
          <div className="flex gap-2 flex-wrap mb-8">
            {gws.map(([gw, amt]) => (
              <div key={gw} className="px-3 py-2 text-xs" style={{ border: "1px solid var(--line)" }}>
                <span style={{ color: "var(--ink-soft)" }}>GW{gw}</span>{" "}
                <span className="mono font-semibold">{fmt(amt)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        By player
      </h3>
      {players.length === 0 && <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>No charges logged yet.</p>}
      <div className="mb-8">
        {players.map(([name, info]) => (
          <div key={name} className="flex items-center justify-between px-3 py-2.5 mb-1.5" style={{ border: "1px solid var(--line)" }}>
            <span className="text-sm">
              <b>{name}</b>{" "}
              <span style={{ color: "var(--ink-soft)" }}>
                {Object.entries(info.events)
                  .map(([type, n]) => `${n > 1 ? n + "× " : ""}${EVENT_LABEL[type] ?? type}`)
                  .join(", ")}
              </span>
            </span>
            <span className="mono text-sm font-bold" style={{ color: "var(--money)" }}>{fmt(info.total)}</span>
          </div>
        ))}
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        Full receipt
      </h3>
      <div className="receipt">
        {charges.length === 0 && <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Nothing logged yet.</p>}
        {charges.map((c) => (
          <div key={c.id} className="receipt-row">
            <span>
              {c.player_name} · {EVENT_LABEL[c.event_type] ?? c.event_type} {c.gw ? `(GW${c.gw})` : ""}
            </span>
            <span className="receipt-amt">{fmt(c.amount_cents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
