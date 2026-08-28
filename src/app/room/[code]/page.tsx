"use client";
import { useEffect, useState, useCallback, useRef, useSyncExternalStore, use as useUnwrap } from "react";
import Link from "next/link";
import { getSupabase, Room, Manager, RosterPlayer, BillCharge } from "@/lib/supabase";
import { parseGwTable } from "@/lib/parseGwTable";
import { RATE_KEYS, RATE_LABELS, formatCents, normalizeRates } from "@/lib/rates";

const POS_LABEL: Record<number, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

// The manager's chosen name lives in localStorage — an external store, not React
// state. Reading it in an effect and mirroring it into state caused a cascading
// render on every mount; subscribing to it instead keeps one source of truth and
// picks up changes made in another tab for free.
const nameKeyFor = (roomCode: string) => `thebill_name_${roomCode}`;
const nameListeners = new Set<() => void>();

function readStoredName(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    // Private-mode browsers can throw on access; fall back to asking again.
    return "";
  }
}

function writeStoredName(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Non-fatal: the name just won't be remembered next visit.
  }
  for (const listener of nameListeners) listener();
}

function useStoredName(roomCode: string): string {
  const key = nameKeyFor(roomCode);
  const subscribe = useCallback((onChange: () => void) => {
    nameListeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      nameListeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  const getSnapshot = useCallback(() => readStoredName(key), [key]);
  // There's no localStorage during the server render, so the server snapshot is
  // always "" — the name form renders, then hydration swaps in the stored name.
  return useSyncExternalStore(subscribe, getSnapshot, () => "");
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = useUnwrap(params);
  const roomCode = code.toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [charges, setCharges] = useState<BillCharge[]>([]);
  const myName = useStoredName(roomCode);
  const [nameInput, setNameInput] = useState("");
  const [tab, setTab] = useState<"roster" | "bill">("roster");
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  // Guards against two overlapping "create my manager row" attempts, which would
  // both see no existing row and insert a duplicate.
  const ensuringRef = useRef("");

  const load = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const { data: r, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", roomCode)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!r) {
        setNotFound(true);
        return;
      }
      setNotFound(false);
      setRoom(r);

      const { data: ms } = await supabase
        .from("managers")
        .select("*")
        .eq("room_id", r.id)
        .order("created_at");
      setManagers(ms ?? []);

      const managerIds = (ms ?? []).map((m: Manager) => m.id);
      // Previously both of these were skipped whenever the room had no managers,
      // which also meant stale rows lingered on screen after the last one left.
      const { data: rp } = managerIds.length
        ? await supabase.from("roster_players").select("*").in("manager_id", managerIds)
        : { data: [] };
      setRoster(rp ?? []);

      const { data: bc } = await supabase
        .from("bill_charges")
        .select("*")
        .eq("room_id", r.id)
        .order("created_at", { ascending: false });
      setCharges(bc ?? []);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't reach the server.");
    }
  }, [roomCode]);

  useEffect(() => {
    let cancelled = false;
    // Ensure the room row exists before the first read, so a fresh code doesn't
    // render "not found" on the way in.
    const ensureRoom = fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: roomCode }),
    }).catch(() => undefined);

    ensureRoom.then(() => {
      if (!cancelled) load();
    });

    // Poll for other managers' updates, but not while the tab is in the
    // background — this used to keep firing every 3s forever in every open tab.
    const tick = () => {
      if (!cancelled && document.visibilityState === "visible") load();
    };
    const t = setInterval(tick, 10_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [roomCode, load]);

  const ensureManager = useCallback(
    async (name: string, roomId: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        const supabase = getSupabase();
        // limit(1) rather than maybeSingle(): a duplicate row left by an earlier
        // race made maybeSingle() error out and blocked the manager from joining.
        const { data: existing } = await supabase
          .from("managers")
          .select("id")
          .eq("room_id", roomId)
          .eq("name", trimmed)
          .limit(1);
        if (!existing?.length) {
          const { error } = await supabase.from("managers").insert({ room_id: roomId, name: trimmed });
          if (error) throw new Error(error.message);
        }
        await load();
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Couldn't join this room.");
      }
    },
    [load]
  );

  // Joining is only ever "record the name"; the effect below is the single place
  // that creates the row, so a fresh join and a recovery can't both insert one.
  function joinAs(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    writeStoredName(nameKeyFor(roomCode), trimmed);
  }

  const me = managers.find((m) => m.name === myName);

  // Creates the manager row whenever we have a name but no row for it — both on a
  // first join and when a name remembered from a previous visit has lost its row
  // (room reset, failed insert), which used to leave "This Gameweek" permanently
  // blank with no way out.
  useEffect(() => {
    if (!room || !myName || me) return;
    const token = `${room.id}:${myName}`;
    if (ensuringRef.current === token) return;
    ensuringRef.current = token;
    ensureManager(myName, room.id).finally(() => {
      if (ensuringRef.current === token) ensuringRef.current = "";
    });
  }, [room, myName, me, ensureManager]);

  function forgetName() {
    writeStoredName(nameKeyFor(roomCode), "");
    setNameInput("");
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center text-sm" style={{ color: "var(--ink-soft)" }}>
        <div>
          <p className="mb-2">No room called {roomCode}.</p>
          <Link href="/" style={{ color: "var(--money)" }}>Go back and enter a code</Link>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center text-sm" style={{ color: "var(--ink-soft)" }}>
        <div>
          <p>{loadError ? "Couldn't load this room." : "Loading room…"}</p>
          {loadError && <p className="mt-2" style={{ color: "var(--money)" }}>{loadError}</p>}
        </div>
      </div>
    );
  }

  if (!myName) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-sm w-full">
          <h2 className="text-2xl font-semibold mb-2">Room {roomCode}</h2>
          <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>What&apos;s your name?</p>
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
            disabled={!nameInput.trim()}
            className="w-full py-3 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-40"
            style={{ background: "var(--ink)" }}
          >
            Enter
          </button>
          {loadError && <p className="mt-3 text-sm" style={{ color: "var(--money)" }}>{loadError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5" style={{ background: "var(--money)", transform: "rotate(45deg)" }} />
          <h1 className="text-sm font-semibold uppercase tracking-widest">The Bill</h1>
        </div>
        <button
          onClick={forgetName}
          title="Switch to a different name"
          className="text-xs uppercase tracking-widest mono px-2 py-1"
          style={{ border: "1px solid var(--line)", color: "var(--ink-soft)", background: "transparent", cursor: "pointer" }}
        >
          Room {roomCode} · {myName}
        </button>
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
        {loadError && <p className="text-sm mb-4" style={{ color: "var(--money)" }}>{loadError}</p>}
        {tab === "roster" &&
          (me ? (
            <RosterTab
              room={room}
              manager={me}
              roster={roster.filter((r) => r.manager_id === me.id)}
              managers={managers}
              roster_all={roster}
              onChange={load}
            />
          ) : (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Joining as {myName}…</p>
          ))}
        {tab === "bill" && <BillTab room={room} managers={managers} charges={charges} />}
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
    try {
      const res = await fetch("/api/gameweek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.id, managerId: manager.id, gw, raw }),
      });
      const data = await res.json();
      if (data.error) {
        setErr(data.error);
        return;
      }
      setMsg(
        `GW${gw} logged — ${data.chargesAdded} charge${data.chargesAdded === 1 ? "" : "s"} from ${data.playersParsed} players.`
      );
      setPreview(null);
      setRaw("");
      onChange();
    } catch {
      // Without this the promise rejected unhandled and the button stayed
      // stuck on "Logging…" forever.
      setErr("Couldn't reach the server — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
        On the FPL Draft site, open your team&apos;s <b>Points</b> page for this gameweek and copy the whole table
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
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            // Clamp here too: the number input's min/max don't stop typed values,
            // and the API rejects anything outside 1–38.
            setGw(Number.isNaN(n) ? 1 : Math.min(38, Math.max(1, n)));
          }}
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

      {preview && preview.warnings.length > 0 && (
        <div className="mb-3 px-3 py-2 text-xs" style={{ border: "1px solid var(--money)", color: "var(--money)" }}>
          {preview.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

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
                {p.name}{" "}
                <span style={{ color: "var(--ink-soft)" }}>
                  ({p.team}){" "}
                  {p.autoSubbedOut
                    ? "· started, auto-subbed off"
                    : p.autoSubbedIn
                      ? "· auto-subbed on"
                      : p.started
                        ? ""
                        : "· bench"}
                </span>
              </span>
              <span className="text-xs mono" style={{ color: "var(--ink-soft)" }}>
                {p.minutes}′{p.autoSubbedOut ? " · didn\u2019t play, charged" : ""}{p.goals ? ` · ${p.goals}g` : ""}{p.assists ? ` · ${p.assists}a` : ""}{p.yellowCards ? " · YC" : ""}{p.redCards ? " · RC" : ""}
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
}: {
  room: Room;
  managers: Manager[];
  charges: BillCharge[];
}) {
  const [selected, setSelected] = useState<Manager | null>(null);
  const [rateError, setRateError] = useState("");

  // Derived straight from the room row rather than mirrored into state via an
  // effect — that mirror meant a rate another manager changed never showed up,
  // and `room.bill_rates` being null crashed the editor outright.
  const rates = normalizeRates(room.bill_rates);

  async function saveRate(key: string, euros: string) {
    const cents = Math.round(parseFloat(euros) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setRateError("Enter a rate as a positive amount, e.g. 2.50.");
      return;
    }
    setRateError("");
    const next = { ...rates, [key]: cents };
    const { error } = await getSupabase().from("rooms").update({ bill_rates: next }).eq("id", room.id);
    if (error) setRateError(error.message);
  }

  const totals = new Map<string, number>();
  for (const c of charges) totals.set(c.manager_id, (totals.get(c.manager_id) ?? 0) + c.amount_cents);
  const ranked = [...managers].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
  const leaderAmt = ranked.length ? totals.get(ranked[0].id) ?? 0 : 0;

  const fmt = formatCents;

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
        pastes each gameweek. Fouls aren&apos;t in the FPL data at all, so they&apos;re excluded.
      </p>

      {(room.synced_gws?.length ?? 0) > 0 && (
        <p className="text-xs mb-6" style={{ color: "var(--ink-soft)" }}>
          Gameweeks logged: {[...(room.synced_gws ?? [])].sort((a, b) => a - b).join(", ")}
        </p>
      )}

      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        Rates
      </h3>
      <div className="grid grid-cols-2 gap-2 mb-2">
        {RATE_KEYS.map((key) => (
          <div key={key} className="px-3 py-2" style={{ border: "1px solid var(--line)" }}>
            <label className="block text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>
              {RATE_LABELS[key]}
            </label>
            <input
              // Uncontrolled so typing isn't fought by the poll, but re-keyed on the
              // saved value so a rate someone else changed actually appears.
              key={`${key}-${rates[key]}`}
              defaultValue={(rates[key] / 100).toFixed(2)}
              onBlur={(e) => saveRate(key, e.target.value)}
              inputMode="decimal"
              aria-label={RATE_LABELS[key]}
              className="mono text-sm w-full outline-none"
            />
          </div>
        ))}
      </div>
      {rateError && <p className="text-sm mb-2" style={{ color: "var(--money)" }}>{rateError}</p>}
      <p className="text-xs mb-8" style={{ color: "var(--ink-soft)" }}>
        Editing a rate changes what future gameweeks cost. Charges already logged keep the
        price they were logged at — re-paste a gameweek to re-price it.
      </p>

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
        {charges.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            No charges yet — log a gameweek from &ldquo;This Gameweek&rdquo;.
          </p>
        )}
        {charges.slice(0, RECEIPT_LIMIT).map((c) => {
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
        {charges.length > RECEIPT_LIMIT && (
          <p className="text-xs pt-2" style={{ color: "var(--ink-soft)" }}>
            Showing the {RECEIPT_LIMIT} most recent of {charges.length} charges — open a team above
            for its full receipt.
          </p>
        )}
      </div>
    </div>
  );
}

const RECEIPT_LIMIT = 60;

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
  const fmt = formatCents;
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
