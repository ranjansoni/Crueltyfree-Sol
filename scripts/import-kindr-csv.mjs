import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ASSESSMENT_STATUSES = ["verified", "certified", "brand_claimed", "conflicting", "unverified", "no", "unknown"];
const SOURCE_TYPES = ["certification", "brand_policy", "retailer_page", "third_party_database", "email", "packaging", "manual_review", "other"];
const AVAILABILITY_STATUSES = ["in_stock", "out_of_stock", "online_only", "in_store_only", "limited", "unknown"];
const REQUIRED_FIELDS = [
  "brand_name",
  "product_name",
  "category",
  "subcategory",
  "brand_cruelty_free_status",
  "brand_evidence_source_type",
  "product_vegan_status",
  "product_evidence_source_type",
  "country",
  "currency",
  "expected_price",
  "retailer_name",
];

function loadEnv() {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1]] ??= match[2].replace(/^"|"$/g, "");
  }
}

function normalizeName(value = "") {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell.trim());
  return cells;
}

function parseCsv(csv) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index]?.trim() ?? "";
      return row;
    }, {});
  });
}

function validateRow(raw, rowNumber) {
  const messages = [];
  for (const field of REQUIRED_FIELDS) {
    if (!raw[field]?.trim()) messages.push({ level: "error", field, message: `${field} is required.` });
  }

  const country = raw.country?.trim().toUpperCase();
  const currency = raw.currency?.trim().toUpperCase();
  const brandStatus = raw.brand_cruelty_free_status?.trim();
  const productStatus = raw.product_vegan_status?.trim();
  const brandSourceType = raw.brand_evidence_source_type?.trim();
  const productSourceType = raw.product_evidence_source_type?.trim();
  const availabilityStatus = raw.availability_status?.trim() || "unknown";
  const price = Number.parseFloat((raw.expected_price ?? "").replace(/[$,]/g, ""));

  if (country !== "CA" && country !== "US") messages.push({ level: "error", field: "country", message: "Country must be CA or US." });
  if (currency !== "CAD" && currency !== "USD") messages.push({ level: "error", field: "currency", message: "Currency must be CAD or USD." });
  if (!Number.isFinite(price) || price < 0) messages.push({ level: "error", field: "expected_price", message: "Expected price must be a positive number." });
  if (!ASSESSMENT_STATUSES.includes(brandStatus)) messages.push({ level: "error", field: "brand_cruelty_free_status", message: "Invalid brand status." });
  if (!ASSESSMENT_STATUSES.includes(productStatus)) messages.push({ level: "error", field: "product_vegan_status", message: "Invalid vegan status." });
  if (!SOURCE_TYPES.includes(brandSourceType)) messages.push({ level: "error", field: "brand_evidence_source_type", message: "Invalid brand source type." });
  if (!SOURCE_TYPES.includes(productSourceType)) messages.push({ level: "error", field: "product_evidence_source_type", message: "Invalid product source type." });
  if (!AVAILABILITY_STATUSES.includes(availabilityStatus)) messages.push({ level: "error", field: "availability_status", message: "Invalid availability status." });
  if (!raw.review_expiry?.trim()) messages.push({ level: "warning", field: "review_expiry", message: "Review expiry is recommended." });

  const normalizedBrandName = normalizeName(raw.brand_name);
  const normalizedProductName = normalizeName(raw.product_name);
  return {
    rowNumber,
    raw,
    messages,
    status: messages.some((message) => message.level === "error") ? "error" : messages.length > 0 ? "warning" : "valid",
    normalized: {
      ...raw,
      country,
      currency,
      availability_status: availabilityStatus,
      normalized_brand_name: normalizedBrandName,
      normalized_product_name: normalizedProductName,
      normalized_retailer_name: normalizeName(raw.retailer_name),
      product_id: [normalizedBrandName, normalizedProductName].filter(Boolean).join("-"),
      expected_price_number: price,
      tag_list: (raw.tags ?? "").split("|").map((tag) => tag.trim()).filter(Boolean),
    },
  };
}

async function buildReport(supabase, rows) {
  const reportRows = rows.map((row, index) => validateRow(row, index + 2));
  const validRows = reportRows.filter((row) => row.status !== "error");
  const brandNames = validRows.map((row) => row.normalized.normalized_brand_name);
  const productIds = validRows.map((row) => row.normalized.product_id);

  const [{ data: brands }, { data: products }] = await Promise.all([
    brandNames.length ? supabase.from("brands").select("id, normalized_name").in("normalized_name", brandNames) : { data: [] },
    productIds.length ? supabase.from("products").select("id").in("id", productIds) : { data: [] },
  ]);

  const brandMatches = new Map((brands ?? []).map((brand) => [brand.normalized_name, brand.id]));
  const productMatches = new Set((products ?? []).map((product) => product.id));
  for (const row of reportRows) {
    row.match = {
      brandId: brandMatches.get(row.normalized.normalized_brand_name),
      productId: productMatches.has(row.normalized.product_id) ? row.normalized.product_id : undefined,
    };
  }

  return {
    rows: reportRows,
    summary: {
      rowCount: reportRows.length,
      validCount: reportRows.filter((row) => row.status === "valid").length,
      warningCount: reportRows.filter((row) => row.status === "warning").length,
      errorCount: reportRows.filter((row) => row.status === "error").length,
      newBrands: validRows.filter((row) => !row.match.brandId).length,
      matchedBrands: validRows.filter((row) => row.match.brandId).length,
      newProducts: validRows.filter((row) => !row.match.productId).length,
      matchedProducts: validRows.filter((row) => row.match.productId).length,
    },
  };
}

async function insertBatch(supabase, csvPath, report, commit) {
  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      filename: basename(csvPath),
      source_label: "Kindr Canada seed import",
      status: commit ? (report.summary.errorCount > 0 ? "partially_imported" : "imported") : "dry_run",
      dry_run_report: report,
      row_count: report.summary.rowCount,
      valid_count: report.summary.validCount,
      warning_count: report.summary.warningCount,
      error_count: report.summary.errorCount,
      created_by: "kindr",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (report.rows.length > 0) {
    const { error: rowError } = await supabase.from("import_rows").insert(
      report.rows.map((row) => ({
        batch_id: data.id,
        row_number: row.rowNumber,
        raw_data: row.raw,
        normalized_data: row.status === "error" ? {} : row.normalized,
        validation_status: row.status,
        validation_messages: row.messages,
        matched_brand_id: row.match?.brandId,
        matched_product_id: row.match?.productId,
      })),
    );
    if (rowError) throw new Error(rowError.message);
  }

  return data.id;
}

async function upsertRow(supabase, row, batchId) {
  const now = new Date().toISOString();
  const lastChecked = row.last_checked_at ? new Date(row.last_checked_at).toISOString() : now;
  const expiresAt = row.review_expiry ? new Date(row.review_expiry).toISOString() : null;

  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .upsert(
      {
        name: row.brand_name,
        normalized_name: row.normalized_brand_name,
        parent_company: row.parent_company || null,
        normalized_parent_company: row.parent_company ? normalizeName(row.parent_company) : null,
        website_url: row.brand_website || null,
        review_status: "pending_review",
      },
      { onConflict: "normalized_name" },
    )
    .select("id")
    .single();
  if (brandError) throw new Error(brandError.message);

  const { error: productError } = await supabase.from("products").upsert(
    {
      id: row.product_id,
      brand_id: brand.id,
      brand: row.brand_name,
      name: row.product_name,
      normalized_name: row.normalized_product_name,
      category: row.category,
      subcategory: row.subcategory,
      description: row.description || "",
      upc: row.upc || null,
      sku: row.sku || null,
      tags: row.tag_list,
      badges: ["Imported"],
      certifications: [],
      colour: "#dcead7",
      accent: "#416547",
      review_status: "pending_review",
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (productError) throw new Error(productError.message);

  const { data: brandAssessment, error: brandAssessmentError } = await supabase
    .from("brand_assessments")
    .insert({
      brand_id: brand.id,
      assessment_type: "cruelty_free",
      status: row.brand_cruelty_free_status,
      geographic_scope: row.brand_cruelty_free_scope || row.country,
      summary: row.brand_evidence_summary || "",
      reviewer: row.reviewer || null,
      reviewed_at: now,
      verified_at: ["verified", "certified"].includes(row.brand_cruelty_free_status) ? now : null,
      expires_at: expiresAt,
      import_batch_id: batchId,
    })
    .select("id")
    .single();
  if (brandAssessmentError) throw new Error(brandAssessmentError.message);

  const { data: productAssessment, error: productAssessmentError } = await supabase
    .from("product_assessments")
    .insert({
      product_id: row.product_id,
      assessment_type: "vegan",
      status: row.product_vegan_status,
      geographic_scope: row.product_vegan_scope || row.country,
      summary: row.product_evidence_summary || "",
      reviewer: row.reviewer || null,
      reviewed_at: now,
      verified_at: ["verified", "certified"].includes(row.product_vegan_status) ? now : null,
      expires_at: expiresAt,
      import_batch_id: batchId,
    })
    .select("id")
    .single();
  if (productAssessmentError) throw new Error(productAssessmentError.message);

  const { error: evidenceError } = await supabase.from("evidence_sources").insert([
    {
      entity_type: "brand",
      entity_id: brand.id,
      brand_assessment_id: brandAssessment.id,
      source_type: row.brand_evidence_source_type,
      title: `${row.brand_name} cruelty-free evidence`,
      url: row.brand_evidence_url || null,
      accessed_at: lastChecked.slice(0, 10),
      geographic_scope: row.brand_cruelty_free_scope || row.country,
      quote_or_summary: row.brand_evidence_summary || "",
      reviewer: row.reviewer || null,
      import_batch_id: batchId,
    },
    {
      entity_type: "product",
      entity_id: row.product_id,
      product_assessment_id: productAssessment.id,
      source_type: row.product_evidence_source_type,
      title: `${row.product_name} vegan evidence`,
      url: row.product_evidence_url || null,
      accessed_at: lastChecked.slice(0, 10),
      geographic_scope: row.product_vegan_scope || row.country,
      quote_or_summary: row.product_evidence_summary || "",
      reviewer: row.reviewer || null,
      import_batch_id: batchId,
    },
  ]);
  if (evidenceError) throw new Error(evidenceError.message);

  const { error: offerError } = await supabase.from("product_offers").upsert(
    {
      product_id: row.product_id,
      country_code: row.country,
      currency: row.currency,
      expected_price: row.expected_price_number,
      store_name: row.retailer_name,
      normalized_store_name: row.normalized_retailer_name,
      retailer_url: row.retailer_url || null,
      availability_status: row.availability_status || "unknown",
      sku: row.sku || null,
      source_url: row.retailer_url || null,
      last_checked_at: lastChecked,
      review_status: "pending_review",
    },
    { onConflict: "product_id,country_code,store_name" },
  );
  if (offerError) throw new Error(offerError.message);

  return { brandId: brand.id, productId: row.product_id };
}

async function main() {
  const csvPath = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!csvPath) throw new Error("Usage: node scripts/import-kindr-csv.mjs <csv-path> [--commit]");

  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars are missing.");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  const report = await buildReport(supabase, rows);
  const batchId = await insertBatch(supabase, csvPath, report, commit);

  if (commit) {
    for (const row of report.rows) {
      if (row.status === "error") continue;
      const imported = await upsertRow(supabase, row.normalized, batchId);
      await supabase
        .from("import_rows")
        .update({ imported_brand_id: imported.brandId, imported_product_id: imported.productId })
        .eq("batch_id", batchId)
        .eq("row_number", row.rowNumber);
    }
  }

  console.log(JSON.stringify({ batchId, committed: commit, summary: report.summary }, null, 2));
  if (report.summary.errorCount > 0) {
    console.log(JSON.stringify(report.rows.filter((row) => row.status === "error").slice(0, 10), null, 2));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
