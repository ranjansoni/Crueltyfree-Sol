import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { ASSESSMENT_STATUSES, SOURCE_TYPES } from "@/lib/importer/catalogue";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const blocked = requireAdmin(request);
  if (blocked) return blocked;

  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  let body: {
    targetType?: "brand" | "product";
    targetId?: string;
    status?: string;
    geographicScope?: string;
    summary?: string;
    reviewer?: string;
    expiresAt?: string;
    sourceType?: string;
    sourceUrl?: string;
    sourceTitle?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.targetType || !body.targetId) return NextResponse.json({ error: "Assessment target is required." }, { status: 400 });
  if (!body.status || !ASSESSMENT_STATUSES.includes(body.status as never)) return NextResponse.json({ error: "Valid status is required." }, { status: 400 });
  if (body.sourceType && !SOURCE_TYPES.includes(body.sourceType as never)) return NextResponse.json({ error: "Invalid source type." }, { status: 400 });

  const now = new Date().toISOString();
  const isVerified = body.status === "verified" || body.status === "certified";
  const assessmentTable = body.targetType === "brand" ? "brand_assessments" : "product_assessments";
  const entityKey = body.targetType === "brand" ? "brand_id" : "product_id";
  const assessmentType = body.targetType === "brand" ? "cruelty_free" : "vegan";

  const { data: assessment, error: assessmentError } = await supabase
    .from(assessmentTable)
    .insert({
      [entityKey]: body.targetId,
      assessment_type: assessmentType,
      status: body.status,
      geographic_scope: body.geographicScope || "unknown",
      summary: body.summary || "",
      reviewer: body.reviewer || null,
      reviewed_at: now,
      verified_at: isVerified ? now : null,
      expires_at: body.expiresAt || null,
    })
    .select("id")
    .single();

  if (assessmentError) return NextResponse.json({ error: assessmentError.message }, { status: 500 });

  if (body.sourceTitle || body.sourceUrl || body.summary) {
    const { error: evidenceError } = await supabase.from("evidence_sources").insert({
      entity_type: body.targetType,
      entity_id: body.targetId,
      brand_assessment_id: body.targetType === "brand" ? assessment.id : null,
      product_assessment_id: body.targetType === "product" ? assessment.id : null,
      source_type: body.sourceType || "manual_review",
      title: body.sourceTitle || `${body.targetType} assessment evidence`,
      url: body.sourceUrl || null,
      accessed_at: now.slice(0, 10),
      geographic_scope: body.geographicScope || "unknown",
      quote_or_summary: body.summary || "",
      reviewer: body.reviewer || null,
    });
    if (evidenceError) return NextResponse.json({ error: evidenceError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, assessmentId: assessment.id });
}
