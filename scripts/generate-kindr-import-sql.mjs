import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const ASSESSMENT_STATUSES = ["verified", "certified", "brand_claimed", "conflicting", "unverified", "no", "unknown"];
const SOURCE_TYPES = ["certification", "brand_policy", "retailer_page", "third_party_database", "email", "packaging", "manual_review", "other"];
const AVAILABILITY_STATUSES = ["in_stock", "out_of_stock", "online_only", "in_store_only", "limited", "unknown"];
const SOURCE_TYPE_ALIASES = {
  certification_directory: "certification",
  product_page: "retailer_page",
};
const AVAILABILITY_ALIASES = {
  available: "in_stock",
  unavailable: "out_of_stock",
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
];

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
  const brandSourceTypeRaw = raw.brand_evidence_source_type?.trim();
  const productSourceTypeRaw = raw.product_evidence_source_type?.trim();
  const brandSourceType = SOURCE_TYPE_ALIASES[brandSourceTypeRaw] ?? brandSourceTypeRaw;
  const productSourceType = SOURCE_TYPE_ALIASES[productSourceTypeRaw] ?? productSourceTypeRaw;
  const availabilityRaw = raw.availability_status?.trim() || "unknown";
  const availabilityStatus = AVAILABILITY_ALIASES[availabilityRaw] ?? availabilityRaw;
  const hasExpectedPrice = !!raw.expected_price?.trim();
  const hasRetailerName = !!raw.retailer_name?.trim();
  const retailerName = hasRetailerName ? raw.retailer_name : "Unknown retailer";
  const price = hasExpectedPrice ? Number.parseFloat((raw.expected_price ?? "").replace(/[$,]/g, "")) : 0;

  if (country !== "CA" && country !== "US") messages.push({ level: "error", field: "country", message: "Country must be CA or US." });
  if (currency !== "CAD" && currency !== "USD") messages.push({ level: "error", field: "currency", message: "Currency must be CAD or USD." });
  if (!hasExpectedPrice) messages.push({ level: "warning", field: "expected_price", message: "Missing price; product will be imported inactive for admin review." });
  if (!hasRetailerName) messages.push({ level: "warning", field: "retailer_name", message: "Missing retailer; product will be imported inactive for admin review." });
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
    status: messages.some((message) => message.level === "error") ? "error" : messages.length > 0 ? "warning" : "valid",
    messages,
    normalized: {
      ...raw,
      country,
      currency,
      brand_evidence_source_type: brandSourceType,
      product_evidence_source_type: productSourceType,
      availability_status: availabilityStatus,
      normalized_brand_name: normalizedBrandName,
      normalized_product_name: normalizedProductName,
      retailer_name: retailerName,
      normalized_retailer_name: normalizeName(retailerName),
      product_id: [normalizedBrandName, normalizedProductName].filter(Boolean).join("-"),
      expected_price_number: price,
      has_expected_price: hasExpectedPrice,
      is_public_ready: hasExpectedPrice && hasRetailerName,
      tag_list: (raw.tags ?? "").split("|").map((tag) => tag.trim()).filter(Boolean),
    },
  };
}

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return sqlString(JSON.stringify(value));
}

function sqlTextArray(values) {
  if (!values.length) return "'{}'::text[]";
  return `array[${values.map(sqlString).join(",")}]::text[]`;
}

function generateSql(csvPath, rows) {
  const validRows = rows.filter((row) => row.status !== "error");
  const warnings = rows.filter((row) => row.status === "warning").length;
  const errors = rows.filter((row) => row.status === "error").length;

  if (errors > 0) {
    throw new Error(`CSV has ${errors} validation error rows. Fix them before generating import SQL.`);
  }

  const statements = [
    "begin;",
    "create temp table kindr_import_map(row_number integer primary key, brand_id uuid, product_id text, brand_assessment_id uuid, product_assessment_id uuid) on commit drop;",
    `insert into public.import_batches(filename, source_label, status, dry_run_report, row_count, valid_count, warning_count, error_count, created_by) values (${sqlString(basename(csvPath))}, 'Kindr Canada seed import', 'imported', ${sqlJson({ summary: { rowCount: rows.length, validCount: rows.filter((row) => row.status === "valid").length, warningCount: warnings, errorCount: errors } })}::jsonb, ${rows.length}, ${rows.filter((row) => row.status === "valid").length}, ${warnings}, ${errors}, 'kindr');`,
    "select id as batch_id from public.import_batches where filename = " + sqlString(basename(csvPath)) + " order by created_at desc limit 1;",
  ];

  for (const row of rows) {
    statements.push(`insert into public.import_rows(batch_id, row_number, raw_data, normalized_data, validation_status, validation_messages)
select b.id, ${row.rowNumber}, ${sqlJson(row.raw)}::jsonb, ${sqlJson(row.normalized)}::jsonb, ${sqlString(row.status)}, ${sqlJson(row.messages)}::jsonb
from public.import_batches b where b.filename = ${sqlString(basename(csvPath))} order by b.created_at desc limit 1;`);
  }

  for (const row of validRows) {
    const r = row.normalized;
    const lastChecked = r.last_checked_at || new Date().toISOString().slice(0, 10);
    const reviewExpiry = r.review_expiry || null;
    statements.push(`
with batch as (
  select id from public.import_batches where filename = ${sqlString(basename(csvPath))} order by created_at desc limit 1
),
brand_upsert as (
  insert into public.brands(name, normalized_name, parent_company, normalized_parent_company, website_url, review_status)
  values (${sqlString(r.brand_name)}, ${sqlString(r.normalized_brand_name)}, ${sqlString(r.parent_company)}, ${sqlString(normalizeName(r.parent_company))}, ${sqlString(r.brand_website)}, 'pending_review')
  on conflict (normalized_name) do update set
    name = excluded.name,
    parent_company = coalesce(excluded.parent_company, public.brands.parent_company),
    normalized_parent_company = coalesce(excluded.normalized_parent_company, public.brands.normalized_parent_company),
    website_url = coalesce(excluded.website_url, public.brands.website_url),
    updated_at = now()
  returning id
),
product_upsert as (
  insert into public.products(id, brand_id, brand, name, normalized_name, category, subcategory, description, upc, sku, tags, badges, certifications, colour, accent, review_status, is_active)
  select ${sqlString(r.product_id)}, brand_upsert.id, ${sqlString(r.brand_name)}, ${sqlString(r.product_name)}, ${sqlString(r.normalized_product_name)}, ${sqlString(r.category)}, ${sqlString(r.subcategory)}, ${sqlString(r.description)}, ${sqlString(r.upc)}, ${sqlString(r.sku)}, ${sqlTextArray(r.tag_list)}, array['Imported']::text[], '{}'::text[], '#dcead7', '#416547', 'pending_review', ${r.is_public_ready ? "true" : "false"}
  from brand_upsert
  on conflict (id) do update set
    brand_id = excluded.brand_id,
    brand = excluded.brand,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    category = excluded.category,
    subcategory = excluded.subcategory,
    description = excluded.description,
    upc = excluded.upc,
    sku = excluded.sku,
    tags = excluded.tags,
    updated_at = now()
  returning id
),
brand_assessment as (
  insert into public.brand_assessments(brand_id, assessment_type, status, geographic_scope, summary, reviewer, reviewed_at, verified_at, expires_at, import_batch_id)
  select brand_upsert.id, 'cruelty_free', ${sqlString(r.brand_cruelty_free_status)}::public.assessment_status, ${sqlString(r.brand_cruelty_free_scope || r.country)}, ${sqlString(r.brand_evidence_summary)}, ${sqlString(r.reviewer)}, now(), case when ${sqlString(r.brand_cruelty_free_status)} in ('verified','certified') then now() else null end, ${sqlString(reviewExpiry)}::timestamptz, batch.id
  from brand_upsert, batch
  returning id
),
product_assessment as (
  insert into public.product_assessments(product_id, assessment_type, status, geographic_scope, summary, reviewer, reviewed_at, verified_at, expires_at, import_batch_id)
  select product_upsert.id, 'vegan', ${sqlString(r.product_vegan_status)}::public.assessment_status, ${sqlString(r.product_vegan_scope || r.country)}, ${sqlString(r.product_evidence_summary)}, ${sqlString(r.reviewer)}, now(), case when ${sqlString(r.product_vegan_status)} in ('verified','certified') then now() else null end, ${sqlString(reviewExpiry)}::timestamptz, batch.id
  from product_upsert, batch
  returning id
),
offer_upsert as (
  insert into public.product_offers(product_id, country_code, currency, expected_price, store_name, normalized_store_name, retailer_url, availability_status, sku, source_url, last_checked_at, review_status)
  select product_upsert.id, ${sqlString(r.country)}, ${sqlString(r.currency)}, ${r.expected_price_number}, ${sqlString(r.retailer_name)}, ${sqlString(r.normalized_retailer_name)}, ${sqlString(r.retailer_url)}, ${sqlString(r.availability_status)}::public.availability_status, ${sqlString(r.sku)}, ${sqlString(r.retailer_url)}, ${sqlString(lastChecked)}::timestamptz, 'pending_review'
  from product_upsert
  on conflict (product_id, country_code, store_name) do update set
    currency = excluded.currency,
    expected_price = excluded.expected_price,
    normalized_store_name = excluded.normalized_store_name,
    retailer_url = excluded.retailer_url,
    availability_status = excluded.availability_status,
    sku = excluded.sku,
    source_url = excluded.source_url,
    last_checked_at = excluded.last_checked_at,
    review_status = excluded.review_status
  returning id
),
evidence_insert as (
  insert into public.evidence_sources(entity_type, entity_id, brand_assessment_id, product_assessment_id, source_type, title, url, accessed_at, geographic_scope, quote_or_summary, reviewer, import_batch_id)
  select 'brand', brand_upsert.id::text, brand_assessment.id, null, ${sqlString(r.brand_evidence_source_type)}::public.source_type, ${sqlString(`${r.brand_name} cruelty-free evidence`)}, ${sqlString(r.brand_evidence_url)}, ${sqlString(lastChecked)}::date, ${sqlString(r.brand_cruelty_free_scope || r.country)}, ${sqlString(r.brand_evidence_summary)}, ${sqlString(r.reviewer)}, batch.id
  from brand_upsert, brand_assessment, batch
  union all
  select 'product', product_upsert.id, null, product_assessment.id, ${sqlString(r.product_evidence_source_type)}::public.source_type, ${sqlString(`${r.product_name} vegan evidence`)}, ${sqlString(r.product_evidence_url)}, ${sqlString(lastChecked)}::date, ${sqlString(r.product_vegan_scope || r.country)}, ${sqlString(r.product_evidence_summary)}, ${sqlString(r.reviewer)}, batch.id
  from product_upsert, product_assessment, batch
)
insert into kindr_import_map(row_number, brand_id, product_id, brand_assessment_id, product_assessment_id)
select ${row.rowNumber}, brand_upsert.id, product_upsert.id, brand_assessment.id, product_assessment.id
from brand_upsert, product_upsert, brand_assessment, product_assessment;`);
  }

  statements.push(`update public.import_rows ir
set imported_brand_id = m.brand_id, imported_product_id = m.product_id
from kindr_import_map m, public.import_batches b
where ir.batch_id = b.id and b.filename = ${sqlString(basename(csvPath))} and ir.row_number = m.row_number;`);
  statements.push(`select json_build_object(
  'rows', ${rows.length},
  'valid', ${rows.filter((row) => row.status === "valid").length},
  'warnings', ${warnings},
  'errors', ${errors},
  'products_imported', (select count(*) from kindr_import_map)
) as import_summary;`);
  statements.push("commit;");

  return statements.join("\n");
}

const csvPath = process.argv[2];
const outputPath = process.argv[3];
if (!csvPath || !outputPath) {
  throw new Error("Usage: node scripts/generate-kindr-import-sql.mjs <csv-path> <output-sql-path>");
}

const rows = parseCsv(readFileSync(csvPath, "utf8")).map((row, index) => validateRow(row, index + 2));
const sql = generateSql(csvPath, rows);
writeFileSync(outputPath, sql);
console.log(JSON.stringify({
  outputPath,
  rows: rows.length,
  valid: rows.filter((row) => row.status === "valid").length,
  warnings: rows.filter((row) => row.status === "warning").length,
  errors: rows.filter((row) => row.status === "error").length,
}, null, 2));
