import { SupabaseClient } from "@supabase/supabase-js";

export const ASSESSMENT_STATUSES = ["verified", "certified", "brand_claimed", "conflicting", "unverified", "no", "unknown"] as const;
export const SOURCE_TYPES = ["certification", "brand_policy", "retailer_page", "third_party_database", "email", "packaging", "manual_review", "other"] as const;
export const AVAILABILITY_STATUSES = ["in_stock", "out_of_stock", "online_only", "in_store_only", "limited", "unknown"] as const;

type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];
type SourceType = (typeof SOURCE_TYPES)[number];
type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export type ImportRow = {
  brand_name: string;
  parent_company?: string;
  brand_website?: string;
  product_name: string;
  category: string;
  subcategory: string;
  description?: string;
  upc?: string;
  sku?: string;
  tags?: string;
  brand_cruelty_free_status: AssessmentStatus;
  brand_cruelty_free_scope?: string;
  brand_evidence_source_type: SourceType;
  brand_evidence_url?: string;
  brand_evidence_summary?: string;
  product_vegan_status: AssessmentStatus;
  product_vegan_scope?: string;
  product_evidence_source_type: SourceType;
  product_evidence_url?: string;
  product_evidence_summary?: string;
  country: "CA" | "US";
  currency: "CAD" | "USD";
  expected_price: string;
  retailer_name: string;
  retailer_url?: string;
  availability_status?: AvailabilityStatus;
  last_checked_at?: string;
  reviewer?: string;
  review_expiry?: string;
};

export type ValidationMessage = {
  level: "error" | "warning";
  field?: string;
  message: string;
};

export type NormalizedImportRow = ImportRow & {
  normalized_brand_name: string;
  normalized_product_name: string;
  normalized_retailer_name: string;
  product_id: string;
  expected_price_number: number;
  tag_list: string[];
};

export type ImportPreviewRow = {
  rowNumber: number;
  status: "valid" | "warning" | "error";
  messages: ValidationMessage[];
  raw: Record<string, string>;
  normalized?: NormalizedImportRow;
  match?: {
    brandId?: string;
    productId?: string;
  };
};

export type ImportReport = {
  rows: ImportPreviewRow[];
  summary: {
    rowCount: number;
    validCount: number;
    warningCount: number;
    errorCount: number;
    newBrands: number;
    matchedBrands: number;
    newProducts: number;
    matchedProducts: number;
  };
};

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

export function normalizeName(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
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

export function parseCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index]?.trim() ?? "";
      return row;
    }, {});
  });
}

function statusOf(messages: ValidationMessage[]) {
  if (messages.some((message) => message.level === "error")) return "error" as const;
  if (messages.some((message) => message.level === "warning")) return "warning" as const;
  return "valid" as const;
}

function isOneOf<T extends readonly string[]>(value: string, allowed: T): value is T[number] {
  return allowed.includes(value);
}

function normalizeRow(raw: Record<string, string>, rowNumber: number): ImportPreviewRow {
  const messages: ValidationMessage[] = [];

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
  if (country === "CA" && currency && currency !== "CAD") messages.push({ level: "warning", field: "currency", message: "Canada rows usually use CAD." });
  if (country === "US" && currency && currency !== "USD") messages.push({ level: "warning", field: "currency", message: "US rows usually use USD." });
  if (!Number.isFinite(price) || price < 0) messages.push({ level: "error", field: "expected_price", message: "Expected price must be a positive number." });
  if (!isOneOf(brandStatus, ASSESSMENT_STATUSES)) messages.push({ level: "error", field: "brand_cruelty_free_status", message: "Invalid brand assessment status." });
  if (!isOneOf(productStatus, ASSESSMENT_STATUSES)) messages.push({ level: "error", field: "product_vegan_status", message: "Invalid product vegan status." });
  if (!isOneOf(brandSourceType, SOURCE_TYPES)) messages.push({ level: "error", field: "brand_evidence_source_type", message: "Invalid brand source type." });
  if (!isOneOf(productSourceType, SOURCE_TYPES)) messages.push({ level: "error", field: "product_evidence_source_type", message: "Invalid product source type." });
  if (!isOneOf(availabilityStatus, AVAILABILITY_STATUSES)) messages.push({ level: "error", field: "availability_status", message: "Invalid availability status." });
  if ((brandStatus === "verified" || brandStatus === "certified") && !raw.brand_evidence_url?.trim()) {
    messages.push({ level: "warning", field: "brand_evidence_url", message: "Verified or certified brand rows should include source URL." });
  }
  if ((productStatus === "verified" || productStatus === "certified") && !raw.product_evidence_url?.trim()) {
    messages.push({ level: "warning", field: "product_evidence_url", message: "Verified or certified vegan rows should include source URL." });
  }
  if (!raw.review_expiry?.trim()) messages.push({ level: "warning", field: "review_expiry", message: "Review expiry is recommended for every assessment." });

  const normalizedBrandName = normalizeName(raw.brand_name);
  const normalizedProductName = normalizeName(raw.product_name);
  const normalizedRetailerName = normalizeName(raw.retailer_name);
  const productId = [normalizedBrandName, normalizedProductName].filter(Boolean).join("-");

  return {
    rowNumber,
    status: statusOf(messages),
    messages,
    raw,
    normalized: messages.some((message) => message.level === "error")
      ? undefined
      : {
          ...(raw as ImportRow),
          country: country as "CA" | "US",
          currency: currency as "CAD" | "USD",
          brand_cruelty_free_status: brandStatus as AssessmentStatus,
          product_vegan_status: productStatus as AssessmentStatus,
          brand_evidence_source_type: brandSourceType as SourceType,
          product_evidence_source_type: productSourceType as SourceType,
          availability_status: availabilityStatus as AvailabilityStatus,
          normalized_brand_name: normalizedBrandName,
          normalized_product_name: normalizedProductName,
          normalized_retailer_name: normalizedRetailerName,
          product_id: productId,
          expected_price_number: price,
          tag_list: (raw.tags ?? "").split("|").map((tag) => tag.trim()).filter(Boolean),
        },
  };
}

export async function buildImportReport(supabase: SupabaseClient, rawRows: Record<string, string>[]) {
  const rows = rawRows.map((row, index) => normalizeRow(row, index + 2));
  const normalizedBrandNames = rows.map((row) => row.normalized?.normalized_brand_name).filter(Boolean);
  const productIds = rows.map((row) => row.normalized?.product_id).filter(Boolean);

  const [{ data: brands }, { data: products }] = await Promise.all([
    normalizedBrandNames.length
      ? supabase.from("brands").select("id, normalized_name").in("normalized_name", normalizedBrandNames)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? supabase.from("products").select("id").in("id", productIds)
      : Promise.resolve({ data: [] }),
  ]);

  const brandMatches = new Map((brands ?? []).map((brand) => [brand.normalized_name, brand.id]));
  const productMatches = new Set((products ?? []).map((product) => product.id));

  for (const row of rows) {
    if (!row.normalized) continue;
    row.match = {
      brandId: brandMatches.get(row.normalized.normalized_brand_name),
      productId: productMatches.has(row.normalized.product_id) ? row.normalized.product_id : undefined,
    };
  }

  return summarizeReport(rows);
}

function summarizeReport(rows: ImportPreviewRow[]): ImportReport {
  const validRows = rows.filter((row) => row.status !== "error");
  return {
    rows,
    summary: {
      rowCount: rows.length,
      validCount: rows.filter((row) => row.status === "valid").length,
      warningCount: rows.filter((row) => row.status === "warning").length,
      errorCount: rows.filter((row) => row.status === "error").length,
      newBrands: validRows.filter((row) => !row.match?.brandId).length,
      matchedBrands: validRows.filter((row) => row.match?.brandId).length,
      newProducts: validRows.filter((row) => !row.match?.productId).length,
      matchedProducts: validRows.filter((row) => row.match?.productId).length,
    },
  };
}

export async function importCatalogueRows(
  supabase: SupabaseClient,
  rawRows: Record<string, string>[],
  options: { filename: string; sourceLabel?: string; createdBy?: string; dryRun: boolean },
) {
  const report = await buildImportReport(supabase, rawRows);
  const status = options.dryRun ? "dry_run" : report.summary.errorCount > 0 ? "partially_imported" : "imported";

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      filename: options.filename,
      source_label: options.sourceLabel,
      status,
      dry_run_report: report,
      row_count: report.summary.rowCount,
      valid_count: report.summary.validCount,
      warning_count: report.summary.warningCount,
      error_count: report.summary.errorCount,
      created_by: options.createdBy,
    })
    .select("id")
    .single();

  if (batchError) throw new Error(batchError.message);
  const batchId = batch.id as string;

  if (report.rows.length > 0) {
    const { error } = await supabase.from("import_rows").insert(
      report.rows.map((row) => ({
        batch_id: batchId,
        row_number: row.rowNumber,
        raw_data: row.raw,
        normalized_data: row.normalized ?? {},
        validation_status: row.status,
        validation_messages: row.messages,
        matched_brand_id: row.match?.brandId,
        matched_product_id: row.match?.productId,
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (options.dryRun) return { batchId, report };

  for (const row of report.rows) {
    if (!row.normalized || row.status === "error") continue;
    const imported = await upsertCatalogueRow(supabase, row.normalized, batchId);
    await supabase
      .from("import_rows")
      .update({ imported_brand_id: imported.brandId, imported_product_id: imported.productId })
      .eq("batch_id", batchId)
      .eq("row_number", row.rowNumber);
  }

  return { batchId, report };
}

async function upsertCatalogueRow(supabase: SupabaseClient, row: NormalizedImportRow, batchId: string) {
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

  const brandId = brand.id as string;
  const productId = row.product_id;
  const now = new Date().toISOString();
  const lastChecked = row.last_checked_at ? new Date(row.last_checked_at).toISOString() : now;
  const expiresAt = row.review_expiry ? new Date(row.review_expiry).toISOString() : null;

  const { error: productError } = await supabase.from("products").upsert(
    {
      id: productId,
      brand_id: brandId,
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
      brand_id: brandId,
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
      product_id: productId,
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
      entity_id: brandId,
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
      entity_id: productId,
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
      product_id: productId,
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

  return { brandId, productId };
}
