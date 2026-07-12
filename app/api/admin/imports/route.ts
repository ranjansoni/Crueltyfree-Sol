import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { importCatalogueRows, parseCsv } from "@/lib/importer/catalogue";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const blocked = requireAdmin(request);
  if (blocked) return blocked;

  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const { data, error } = await supabase
    .from("import_batches")
    .select("id, filename, source_label, status, row_count, valid_count, warning_count, error_count, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ batches: data });
}

export async function POST(request: NextRequest) {
  const blocked = requireAdmin(request);
  if (blocked) return blocked;

  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  let body: { csv?: string; filename?: string; sourceLabel?: string; createdBy?: string; dryRun?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.csv?.trim()) return NextResponse.json({ error: "CSV content is required." }, { status: 400 });

  try {
    const rows = parseCsv(body.csv);
    const result = await importCatalogueRows(supabase, rows, {
      filename: body.filename || "kindr-import.csv",
      sourceLabel: body.sourceLabel,
      createdBy: body.createdBy,
      dryRun: body.dryRun !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
