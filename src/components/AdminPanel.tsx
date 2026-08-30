"use client";
import { useState } from "react";
import { getSupabase, Room, Manager } from "@/lib/supabase";
import { parseGwTable } from "@/lib/parseGwTable";
import { RATE_KEYS, RATE_LABELS, normalizeRates, beerPrice } from "@/lib/rates";
import { ADMIN_CODE, setUnlocked } from "@/lib/admin";

export default function AdminPanel({
  room,
  managers,
  unlocked,
  onChange,
}: {
  room: Room;
  managers: Manager[];
  unlocked: boolean;
  onChange: () => Promise<void>;
}) {
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");

  if (!unlocked) {
    const tryUnlock = () => {
      if (codeInput.trim().toLowerCase() === ADMIN_CODE) {
        setUnlocked(true);
        setCodeError("");
        setCodeInput("");
      } else {
        setCodeError("That code isn't right.");
      }
    };
    return (
      <div className="max-w-sm">
        <h2 className="text-xl font-semibold mb-2">Admin</h2>
        <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
          Enter the admin code to edit team names, rates and weekly scores.
        </p>
        <input
          type="password"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
          className="w-full px-3 py-3 mb-3 text-base outline-none"
          style={{ border: "1px solid var(--line)" }}
          placeholder="Admin code"
          aria-label="Admin code"
        />
        <button
          onClick={tryUnlock}
          disabled={!codeInput.trim()}
          className="w-full py-3 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-40"
          style={{ background: "var(--ink)" }}
        >
          Unlock
        </button>
        {codeError && <p className="mt-3 text-sm" style={{ color: "var(--alert)" }}>{codeError}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Admin</h2>
        <button
          onClick={() => {
            setUnlocked(false);
          }}
          className="text-xs font-semibold uppercase tracking-wide px-2 py-1"
          style={{ border: "1px solid var(--line)", color: "var(--ink-soft)", background: "transparent", cursor: "pointer" }}
        >
          Lock
        </button>
      </div>

      <EnterScores room={room} managers={managers} onChange={onChange} />
      <Teams room={room} managers={managers} onChange={onChange} />
      <Rates room={room} onChange={onChange} />
      <BeerPrice room={room} onChange={onChange} />
    </div>
  );
}

// ---------------------------------------------------------------- weekly scores

function EnterScores({
  room,
  managers,
  onChange,
}: {
  room: Room;
  managers: Manager[];
  onChange: () => Promise<void>;
}) {
  const [managerId, setManagerId] = useState("");
  const [gw, setGw] = useState(1);
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof parseGwTable> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const activeManagerId = managerId || managers[0]?.id || "";

  function onParse() {
    setErr("");
    setMsg("");
    if (!raw.trim()) {
      setErr("Paste the gameweek points table first.");
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
    if (!activeManagerId) {
      setErr("Add a team first.");
      return;
    }
    setSubmitting(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/gameweek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.id, managerId: activeManagerId, gw, raw }),
      });
      const data = await res.json();
      if (data.error) {
        setErr(data.error);
        return;
      }
      const who = managers.find((m) => m.id === activeManagerId)?.name ?? "team";
      setMsg(
        `GW${gw} logged for ${who} — ${data.chargesAdded} charge${data.chargesAdded === 1 ? "" : "s"} from ${data.playersParsed} players.`
      );
      setPreview(null);
      setRaw("");
      await onChange();
    } catch {
      setErr("Couldn't reach the server — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mb-10">
      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        Enter weekly scores
      </h3>

      {managers.length === 0 ? (
        <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
          Add a team below first, then come back to log their week.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <select
              value={activeManagerId}
              onChange={(e) => setManagerId(e.target.value)}
              aria-label="Team"
              className="px-2 py-1.5 text-sm outline-none"
              style={{ border: "1px solid var(--line)", background: "transparent" }}
            >
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <span className="text-sm" style={{ color: "var(--ink-soft)" }}>Gameweek</span>
            <input
              type="number"
              min={1}
              max={38}
              value={gw}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setGw(Number.isNaN(n) ? 1 : Math.min(38, Math.max(1, n)));
              }}
              aria-label="Gameweek"
              className="w-16 px-2 py-1.5 text-sm outline-none"
              style={{ border: "1px solid var(--line)" }}
            />
          </div>

          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Paste the FPL Draft points table here…"
            rows={7}
            aria-label="Gameweek points table"
            className="w-full px-3 py-3 mb-3 text-xs mono outline-none"
            style={{ border: "1px solid var(--line)" }}
          />

          <button
            onClick={onParse}
            className="w-full py-2.5 mb-2 text-sm font-semibold uppercase tracking-wide"
            style={{ border: "1px solid var(--ink)", color: "var(--ink)", background: "transparent", cursor: "pointer" }}
          >
            Preview
          </button>
        </>
      )}

      {err && <p className="text-sm mb-3" style={{ color: "var(--alert)" }}>{err}</p>}
      {msg && <p className="text-sm mb-3" style={{ color: "var(--good)" }}>{msg}</p>}

      {preview && preview.warnings.length > 0 && (
        <div className="mb-3 px-3 py-2 text-xs" style={{ border: "1px solid var(--alert)", color: "var(--alert)" }}>
          {preview.warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {preview && (
        <div style={{ border: "1px solid var(--line)" }}>
          {preview.players.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-3 py-2 text-sm"
              style={{ borderBottom: "1px solid var(--line-soft)" }}
            >
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
                  {p.autoSubbedOut ? "· started, auto-subbed off" : p.autoSubbedIn ? "· auto-subbed on" : p.started ? "" : "· bench"}
                </span>
              </span>
              <span className="text-xs mono" style={{ color: "var(--ink-soft)" }}>
                {p.minutes}′{p.autoSubbedOut ? " · didn’t play, charged" : ""}
                {p.goals ? ` · ${p.goals}g` : ""}{p.assists ? ` · ${p.assists}a` : ""}
                {p.yellowCards ? " · YC" : ""}{p.redCards ? " · RC" : ""}
                {p.ownGoals ? " · OG" : ""}{p.penaltiesMissed ? " · missed pen" : ""}
              </span>
            </div>
          ))}
          <div className="p-3">
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="w-full py-2.5 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-40"
              style={{ background: "var(--money)", cursor: "pointer" }}
            >
              {submitting ? "Logging…" : `Log GW${gw}`}
            </button>
            <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
              Re-logging the same team and gameweek replaces its charges rather than doubling them.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------- teams

function Teams({
  room,
  managers,
  onChange,
}: {
  room: Room;
  managers: Manager[];
  onChange: () => Promise<void>;
}) {
  const [bulk, setBulk] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Adding was one name at a time through a box that looked identical to the
  // rename boxes, which made it easy to rename a team instead of adding one.
  // Take a whole list at once and keep the two jobs visually separate.
  async function addTeams() {
    const names = bulk
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) return;

    const seen = new Set(managers.map((m) => m.name.toLowerCase()));
    const fresh: string[] = [];
    for (const n of names) {
      if (seen.has(n.toLowerCase())) continue;
      seen.add(n.toLowerCase());
      fresh.push(n);
    }
    if (fresh.length === 0) {
      setErr("Those teams are already in the league.");
      setMsg("");
      return;
    }

    setBusy(true);
    setErr("");
    setMsg("");
    const { error } = await getSupabase()
      .from("managers")
      // ignoreDuplicates so one repeated name can't reject the whole batch.
      .upsert(
        fresh.map((name) => ({ room_id: room.id, name })),
        { onConflict: "room_id,name", ignoreDuplicates: true }
      );
    if (error) {
      setErr(error.message);
    } else {
      setBulk("");
      const skipped = names.length - fresh.length;
      setMsg(
        `Added ${fresh.length} team${fresh.length === 1 ? "" : "s"}` +
          (skipped > 0 ? ` (${skipped} already existed)` : "") + "."
      );
    }
    setBusy(false);
    await onChange();
  }

  async function rename(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setErr("");
    setMsg("");
    const { error } = await getSupabase().from("managers").update({ name: trimmed }).eq("id", id);
    // A duplicate name trips unique(room_id, name) rather than silently merging
    // two teams' bills.
    if (error) setErr(/duplicate|unique/i.test(error.message) ? "Another team already has that name." : error.message);
    else setDrafts((d) => ({ ...d, [id]: "" }));
    setBusy(false);
    await onChange();
  }

  async function removeTeam(m: Manager) {
    if (!confirm(`Remove ${m.name}? This also deletes all of their charges.`)) return;
    setBusy(true);
    setErr("");
    setMsg("");
    const { error } = await getSupabase().from("managers").delete().eq("id", m.id);
    if (error) setErr(error.message);
    setBusy(false);
    await onChange();
  }

  return (
    <section className="mb-10">
      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        Add teams
      </h3>
      <textarea
        value={bulk}
        onChange={(e) => setBulk(e.target.value)}
        placeholder={"One team per line, e.g.\nTeam Derg\nLuke's XI\nThe Ringers"}
        rows={4}
        aria-label="New team names, one per line"
        className="w-full px-3 py-2 mb-2 text-sm outline-none"
        style={{ border: "1px solid var(--line)" }}
      />
      <button
        onClick={addTeams}
        disabled={!bulk.trim() || busy}
        className="w-full py-2.5 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-30"
        style={{ background: "var(--ink)", cursor: "pointer" }}
      >
        {busy ? "Saving…" : "Add teams"}
      </button>
      {err && <p className="text-sm mt-2" style={{ color: "var(--alert)" }}>{err}</p>}
      {msg && <p className="text-sm mt-2" style={{ color: "var(--good)" }}>{msg}</p>}

      <h3 className="text-xs font-semibold uppercase tracking-widest mt-8 mb-3" style={{ color: "var(--ink-soft)" }}>
        Teams in the league ({managers.length})
      </h3>
      {managers.length === 0 && (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>None yet — add them above.</p>
      )}
      {managers.map((m) => {
        const draft = drafts[m.id] ?? "";
        const changed = Boolean(draft.trim()) && draft.trim() !== m.name;
        return (
          <div key={m.id} className="flex gap-2 mb-2">
            <input
              value={draft || m.name}
              onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && changed && rename(m.id, draft)}
              aria-label={`Rename ${m.name}`}
              className="flex-1 px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid var(--line)" }}
            />
            <button
              onClick={() => rename(m.id, draft)}
              disabled={!changed || busy}
              title="Save the new name"
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wide disabled:opacity-30"
              style={{ border: "1px solid var(--ink)", color: "var(--ink)", background: "transparent", cursor: "pointer" }}
            >
              Rename
            </button>
            <button
              onClick={() => removeTeam(m)}
              disabled={busy}
              title="Remove this team and all of its charges"
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wide disabled:opacity-30"
              style={{ border: "1px solid var(--line)", color: "var(--alert)", background: "transparent", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------- rates

function Rates({ room, onChange }: { room: Room; onChange: () => Promise<void> }) {
  const [err, setErr] = useState("");
  const rates = normalizeRates(room.bill_rates);

  async function saveRate(key: string, euros: string) {
    const cents = Math.round(parseFloat(euros) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setErr("Enter a rate as a positive amount, e.g. 2.50.");
      return;
    }
    setErr("");
    const { error } = await getSupabase()
      .from("rooms")
      .update({ bill_rates: { ...rates, [key]: cents } })
      .eq("id", room.id);
    if (error) setErr(error.message);
    await onChange();
  }

  return (
    <section>
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
      {err && <p className="text-sm mb-2" style={{ color: "var(--alert)" }}>{err}</p>}
      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
        Changing a rate affects weeks logged from now on. Charges keep the price they were
        logged at — re-log a week to re-price it.
      </p>
    </section>
  );
}

// ----------------------------------------------------------------- beer price

function BeerPrice({ room, onChange }: { room: Room; onChange: () => Promise<void> }) {
  const [err, setErr] = useState("");
  const price = beerPrice(room.beer_price_cents);

  async function save(euros: string) {
    const cents = Math.round(parseFloat(euros) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setErr("Enter a price greater than zero, e.g. 6.00.");
      return;
    }
    setErr("");
    const { error } = await getSupabase()
      .from("rooms")
      .update({ beer_price_cents: cents })
      .eq("id", room.id);
    if (error) setErr(error.message);
    await onChange();
  }

  return (
    <section className="mt-10">
      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>
        Price of a pint
      </h3>
      <div className="px-3 py-2 mb-2" style={{ border: "1px solid var(--line)", maxWidth: "12rem" }}>
        <label className="block text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>
          Euros
        </label>
        <input
          key={price}
          defaultValue={(price / 100).toFixed(2)}
          onBlur={(e) => save(e.target.value)}
          inputMode="decimal"
          aria-label="Price of a pint in euros"
          className="mono text-sm w-full outline-none"
        />
      </div>
      {err && <p className="text-sm mb-2" style={{ color: "var(--alert)" }}>{err}</p>}
      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
        Only used to show the pot in pints — it doesn\u2019t affect what anyone owes.
      </p>
    </section>
  );
}
