"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileUp, Loader2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

type ImportReport = {
  batchId: string;
  report: {
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
    rows: Array<{
      rowNumber: number;
      status: "valid" | "warning" | "error";
      messages: Array<{ level: "error" | "warning"; field?: string; message: string }>;
      raw: Record<string, string>;
    }>;
  };
};

const SAMPLE = `brand_name,parent_company,brand_website,product_name,category,subcategory,description,upc,sku,tags,brand_cruelty_free_status,brand_cruelty_free_scope,brand_evidence_source_type,brand_evidence_url,brand_evidence_summary,product_vegan_status,product_vegan_scope,product_evidence_source_type,product_evidence_url,product_evidence_summary,country,currency,expected_price,retailer_name,retailer_url,availability_status,last_checked_at,reviewer,review_expiry
ATTITUDE,,https://attitudeliving.com,Super Leaves Volume Shampoo,Hair care,Shampoo,Gentle daily shampoo,,,shampoo|hair|vegan,brand_claimed,CA,brand_policy,https://attitudeliving.com/pages/faq,Brand states no animal testing.,brand_claimed,CA,brand_policy,https://attitudeliving.com/pages/faq,Brand describes vegan formula.,CA,CAD,11.97,Walmart,https://www.walmart.ca,unknown,2026-07-12,kindr,2027-01-12`;

export default function AdminImportsPage() {
  const [token, setToken] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem("kindr_admin_token") ?? ""));
  const [csv, setCsv] = useState(SAMPLE);
  const [filename, setFilename] = useState("kindr-canada-seed.csv");
  const [sourceLabel, setSourceLabel] = useState("Canada seed batch");
  const [createdBy, setCreatedBy] = useState("kindr");
  const [loading, setLoading] = useState<"dry" | "import" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportReport | null>(null);

  const headers = useMemo(() => csv.split(/\r?\n/)[0]?.split(",") ?? [], [csv]);

  async function run(dryRun: boolean) {
    setError("");
    setLoading(dryRun ? "dry" : "import");
    localStorage.setItem("kindr_admin_token", token);

    try {
      const response = await fetch("/api/admin/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ csv, filename, sourceLabel, createdBy, dryRun }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Import failed");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="admin-shell">
      <Link href="/admin" className="admin-back"><ArrowLeft size={16} /> Admin</Link>
      <section className="admin-workspace">
        <div className="admin-panel import-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="overline">IMPORTER</span>
              <h1>Catalogue import</h1>
            </div>
            <FileUp size={28} />
          </div>

          <div className="admin-form-grid">
            <label>Admin token<input value={token} onChange={(event) => setToken(event.target.value)} type="password" /></label>
            <label>Filename<input value={filename} onChange={(event) => setFilename(event.target.value)} /></label>
            <label>Source label<input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} /></label>
            <label>Reviewer<input value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} /></label>
          </div>

          <label className="csv-editor-label">CSV rows<textarea value={csv} onChange={(event) => setCsv(event.target.value)} spellCheck={false} /></label>

          <div className="admin-actions">
            <button onClick={() => run(true)} disabled={!!loading}>{loading === "dry" ? <Loader2 className="spin" size={16} /> : null} Dry run</button>
            <button className="primary-button" onClick={() => run(false)} disabled={!!loading || !result || result.report.summary.errorCount > 0}>
              {loading === "import" ? <Loader2 className="spin" size={16} /> : null} Confirm import
            </button>
          </div>

          {error && <p className="admin-error"><XCircle size={16} /> {error}</p>}
          <p className="admin-muted">Detected {headers.length} columns. Imports append assessment history and upsert brands, products, and offers idempotently.</p>
        </div>

        <aside className="admin-panel report-panel">
          <span className="overline">DRY-RUN REPORT</span>
          {result ? (
            <>
              <div className="report-metrics">
                <div><strong>{result.report.summary.rowCount}</strong><span>rows</span></div>
                <div><strong>{result.report.summary.validCount}</strong><span>valid</span></div>
                <div><strong>{result.report.summary.warningCount}</strong><span>warnings</span></div>
                <div><strong>{result.report.summary.errorCount}</strong><span>errors</span></div>
              </div>
              <div className="report-matches">
                <p>Brands: {result.report.summary.newBrands} new, {result.report.summary.matchedBrands} matched</p>
                <p>Products: {result.report.summary.newProducts} new, {result.report.summary.matchedProducts} matched</p>
              </div>
              <div className="row-report-list">
                {result.report.rows.slice(0, 25).map((row) => (
                  <article key={row.rowNumber} className={`row-report ${row.status}`}>
                    <h3>{row.raw.brand_name} · {row.raw.product_name}</h3>
                    <p>Row {row.rowNumber} · {row.status}</p>
                    {row.messages.map((message, index) => (
                      <small key={`${row.rowNumber}-${index}`}>{message.field ? `${message.field}: ` : ""}{message.message}</small>
                    ))}
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-admin-state"><CheckCircle2 size={28} /><p>Run a dry run to see validation results before importing.</p></div>
          )}
        </aside>
      </section>
    </main>
  );
}
