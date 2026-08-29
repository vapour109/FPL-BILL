import { NextRequest, NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured, MISSING_ENV_MESSAGE } from "@/lib/supabase";
import { DEFAULT_RATES } from "@/lib/rates";
import { LEAGUE_ROOM_CODE } from "@/lib/room";

const MAX_CODE_LENGTH = 32;

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: MISSING_ENV_MESSAGE }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  // The app serves one league and sends no code; the parameter is kept so the
  // route still works for a named room if multi-room ever comes back.
  const raw = (body as { code?: unknown })?.code;
  const code = typeof raw === "string" && raw.trim() ? raw : LEAGUE_ROOM_CODE;

  // Codes are shared by word of mouth and end up in a URL path, so keep them to
  // something that survives both: letters and digits, upper-cased, bounded length.
  const upper = code.trim().toUpperCase();
  if (upper.length > MAX_CODE_LENGTH) {
    return NextResponse.json(
      { error: `Room code must be ${MAX_CODE_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }
  if (!/^[A-Z0-9]+$/.test(upper)) {
    return NextResponse.json(
      { error: "Room code can only contain letters and numbers." },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const { data: existing, error: lookupError } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", upper)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (existing) return NextResponse.json({ room: existing });

  const { data: created, error } = await supabase
    .from("rooms")
    .insert({ code: upper, bill_rates: DEFAULT_RATES, synced_gws: [] })
    .select("*")
    .single();

  if (error) {
    // Two people entering the same new code at once: one insert wins, the other
    // trips the unique constraint. Fall back to reading the winner's row.
    const { data: raced } = await supabase.from("rooms").select("*").eq("code", upper).maybeSingle();
    if (raced) return NextResponse.json({ room: raced });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ room: created });
}
