import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { code } = await req.json();
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Room code required." }, { status: 400 });
  }
  const upper = code.trim().toUpperCase();

  const { data: existing } = await supabase.from("rooms").select("*").eq("code", upper).maybeSingle();
  if (existing) return NextResponse.json({ room: existing });

  const { data: created, error } = await supabase
    .from("rooms")
    .insert({ code: upper })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ room: created });
}
