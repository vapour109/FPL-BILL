"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabase, Room, Manager, BillCharge } from "@/lib/supabase";
import { LEAGUE_ROOM_CODE } from "@/lib/room";

export type League = {
  room: Room | null;
  managers: Manager[];
  charges: BillCharge[];
  error: string;
  reload: () => Promise<void>;
};

// One place that knows how to read the whole league. Polls while the tab is
// visible so a score entered on one phone shows up on everyone else's.
export function useLeague(): League {
  const [room, setRoom] = useState<Room | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [charges, setCharges] = useState<BillCharge[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const { data: r, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", LEAGUE_ROOM_CODE)
        .maybeSingle();
      if (roomError) throw new Error(roomError.message);
      if (!r) return;
      setRoom(r);

      const { data: ms } = await supabase
        .from("managers")
        .select("*")
        .eq("room_id", r.id)
        .order("created_at");
      setManagers(ms ?? []);

      const { data: bc } = await supabase
        .from("bill_charges")
        .select("*")
        .eq("room_id", r.id)
        .order("created_at", { ascending: false });
      setCharges(bc ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the server.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Make sure the league's room row exists before the first read.
    fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) reload();
      });

    const tick = () => {
      if (!cancelled && document.visibilityState === "visible") reload();
    };
    const t = setInterval(tick, 10_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [reload]);

  return { room, managers, charges, error, reload };
}

// Gameweeks that actually have charges, ascending. Drives every week filter.
export function gameweeksIn(charges: BillCharge[]): number[] {
  const set = new Set<number>();
  for (const c of charges) if (c.gw != null) set.add(c.gw);
  return [...set].sort((a, b) => a - b);
}

export type WeekFilter = number | "all";

export function filterByWeek(charges: BillCharge[], week: WeekFilter): BillCharge[] {
  return week === "all" ? charges : charges.filter((c) => c.gw === week);
}
