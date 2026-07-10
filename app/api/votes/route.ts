import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: { productId?: string; vote?: number; voterId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.productId || !body.voterId || ![-1, 0, 1].includes(body.vote ?? 99)) {
    return NextResponse.json({ error: "Product, voter, and a valid vote are required" }, { status: 400 });
  }

  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ ok: true, mode: "demo" }, { status: 202 });

  const voterHash = createHash("sha256")
    .update(`${body.voterId}:${process.env.VOTE_HASH_SALT ?? "kindr-local"}`)
    .digest("hex");

  const { data, error } = await supabase.rpc("cast_product_vote", {
    p_product_id: body.productId,
    p_voter_hash: voterHash,
    p_value: body.vote,
  });

  if (error) return NextResponse.json({ error: "Vote could not be saved" }, { status: 500 });
  return NextResponse.json({ ok: true, score: data });
}
