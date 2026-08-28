"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function enter() {
    setErr("");
    if (loading) return;
    const trimmed = code.trim();
    if (!trimmed) {
      setErr("Enter a room code — make one up, or use one a friend sent you.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();
      if (data.error) {
        setErr(data.error);
        return;
      }
      router.push(`/room/${encodeURIComponent(data.room.code)}`);
    } catch {
      // A rejected fetch used to go unhandled and leave the button stuck on "Entering…".
      setErr("Couldn't reach the server — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full">
        <div className="flex items-center gap-2 mb-8">
          <span
            className="inline-block w-2.5 h-2.5"
            style={{ background: "var(--money)", transform: "rotate(45deg)" }}
          />
          <h1 className="text-sm font-semibold uppercase tracking-widest">The Bill</h1>
        </div>
        <h2 className="text-3xl mb-2 font-semibold">Every card, goal and blunder — priced.</h2>
        <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
          A side stake for your FPL Draft league. Paste your gameweek points table and the tab
          runs itself — cards, own goals, missed pens, assists, braces and blanking starters,
          priced in euros.
        </p>

        <label className="block text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--ink-soft)" }}>
          Room code
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. GALAXYBRAINS"
          maxLength={32}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Room code"
          className="w-full px-3 py-3 mb-4 text-base outline-none"
          style={{ border: "1px solid var(--line)" }}
          onKeyDown={(e) => e.key === "Enter" && enter()}
        />
        <button
          onClick={enter}
          disabled={loading}
          className="w-full py-3 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-40"
          style={{ background: "var(--ink)" }}
        >
          {loading ? "Entering…" : "Enter room"}
        </button>
        {err && (
          <p className="mt-3 text-sm" style={{ color: "var(--money)" }}>
            {err}
          </p>
        )}
        <p className="mt-6 text-xs" style={{ color: "var(--ink-soft)" }}>
          Same code = same room. Share it with your league and everyone lands in the same tab.
        </p>
      </div>
    </div>
  );
}
