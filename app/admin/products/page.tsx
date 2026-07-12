"use client";

import Link from "next/link";
import { ArrowLeft, Check, Database, Loader2, PlusCircle, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";

type ReviewProduct = {
  product_id: string;
  product_name: string;
  category: string;
  subcategory: string;
  upc?: string | null;
  sku?: string | null;
  product_review_status: string;
  brand_id: string;
  brand_name: string;
  parent_company?: string | null;
  brand_review_status: string;
  brand_cruelty_free_status?: string | null;
  brand_cruelty_free_scope?: string | null;
  brand_review_expires_at?: string | null;
  product_vegan_status?: string | null;
  product_vegan_scope?: string | null;
  product_review_expires_at?: string | null;
  offer_count: number;
  lowest_expected_price?: number | null;
  currency?: string | null;
  stores?: string[] | null;
};

const statuses = ["unknown", "unverified", "brand_claimed", "verified", "certified", "conflicting", "no"];
const sourceTypes = ["manual_review", "certification", "brand_policy", "retailer_page", "third_party_database", "email", "packaging", "other"];

export default function AdminProductsPage() {
  const [token, setToken] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem("kindr_admin_token") ?? ""));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("pending_review");
  const [products, setProducts] = useState<ReviewProduct[]>([]);
  const [selected, setSelected] = useState<ReviewProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [assessment, setAssessment] = useState({
    targetType: "brand",
    status: "unverified",
    geographicScope: "CA",
    summary: "",
    sourceType: "manual_review",
    sourceUrl: "",
    reviewer: "kindr",
    expiresAt: "",
  });

  async function loadProducts() {
    setLoading(true);
    setNotice("");
    localStorage.setItem("kindr_admin_token", token);
    try {
      const params = new URLSearchParams({ status, q: query });
      const response = await fetch(`/api/admin/products?${params}`, { headers: { "x-admin-token": token } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Products could not be loaded");
      setProducts(payload.products ?? []);
      setSelected(payload.products?.[0] ?? null);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Products could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  async function updateSelectedProduct() {
    if (!selected) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({
          productId: selected.product_id,
          product: {
            name: selected.product_name,
            category: selected.category,
            subcategory: selected.subcategory,
            upc: selected.upc,
            sku: selected.sku,
            review_status: selected.product_review_status,
          },
          brand: {
            id: selected.brand_id,
            name: selected.brand_name,
            parent_company: selected.parent_company,
            review_status: selected.brand_review_status,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Update failed");
      setNotice("Product saved.");
      await loadProducts();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  async function appendAssessment() {
    if (!selected) return;
    setLoading(true);
    try {
      const targetId = assessment.targetType === "brand" ? selected.brand_id : selected.product_id;
      const response = await fetch("/api/admin/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ ...assessment, targetId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Assessment could not be saved");
      setNotice("Assessment history appended.");
      await loadProducts();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Assessment could not be saved");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-shell">
      <Link href="/admin" className="admin-back"><ArrowLeft size={16} /> Admin</Link>
      <section className="admin-review-layout">
        <aside className="admin-panel review-list-panel">
          <div className="admin-panel-heading">
            <div>
              <span className="overline">REVIEW QUEUE</span>
              <h1>Products</h1>
            </div>
            <Database size={28} />
          </div>
          <div className="admin-search-row">
            <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search catalogue" /></label>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All</option>
              <option value="pending_review">Pending review</option>
              <option value="approved">Approved</option>
              <option value="needs_more_info">Needs info</option>
              <option value="duplicate">Duplicate</option>
            </select>
            <button onClick={loadProducts} disabled={loading}>{loading ? <Loader2 className="spin" size={16} /> : "Load"}</button>
          </div>
          <label className="admin-token-row">Admin token<input value={token} onChange={(event) => setToken(event.target.value)} type="password" /></label>
          {notice && <p className="admin-notice">{notice}</p>}
          <div className="review-list">
            {products.map((product) => (
              <button key={product.product_id} className={selected?.product_id === product.product_id ? "active" : ""} onClick={() => setSelected(product)}>
                <strong>{product.brand_name}</strong>
                <span>{product.product_name}</span>
                <small>{product.brand_cruelty_free_status ?? "unknown"} brand · {product.product_vegan_status ?? "unknown"} vegan</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="admin-panel review-detail-panel">
          {selected ? (
            <>
              <div className="admin-panel-heading">
                <div>
                  <span className="overline">{selected.brand_name}</span>
                  <h2>{selected.product_name}</h2>
                </div>
                <ShieldCheck size={28} />
              </div>

              <div className="admin-form-grid">
                <label>Brand<input value={selected.brand_name} onChange={(event) => setSelected({ ...selected, brand_name: event.target.value })} /></label>
                <label>Parent company<input value={selected.parent_company ?? ""} onChange={(event) => setSelected({ ...selected, parent_company: event.target.value })} /></label>
                <label>Product<input value={selected.product_name} onChange={(event) => setSelected({ ...selected, product_name: event.target.value })} /></label>
                <label>Category<input value={selected.category} onChange={(event) => setSelected({ ...selected, category: event.target.value })} /></label>
                <label>Subcategory<input value={selected.subcategory} onChange={(event) => setSelected({ ...selected, subcategory: event.target.value })} /></label>
                <label>UPC<input value={selected.upc ?? ""} onChange={(event) => setSelected({ ...selected, upc: event.target.value })} /></label>
                <label>SKU<input value={selected.sku ?? ""} onChange={(event) => setSelected({ ...selected, sku: event.target.value })} /></label>
                <label>Product status<select value={selected.product_review_status} onChange={(event) => setSelected({ ...selected, product_review_status: event.target.value })}><option>pending_review</option><option>approved</option><option>needs_more_info</option><option>duplicate</option><option>rejected</option></select></label>
              </div>

              <div className="assessment-summary">
                <div><span>Brand cruelty-free</span><strong>{selected.brand_cruelty_free_status ?? "unknown"}</strong><small>{selected.brand_cruelty_free_scope ?? "scope unknown"}</small></div>
                <div><span>Product vegan</span><strong>{selected.product_vegan_status ?? "unknown"}</strong><small>{selected.product_vegan_scope ?? "scope unknown"}</small></div>
                <div><span>Offers</span><strong>{selected.offer_count}</strong><small>{selected.stores?.join(", ") || "No offers"}</small></div>
              </div>

              <div className="admin-actions">
                <button className="primary-button" onClick={updateSelectedProduct} disabled={loading}><Check size={16} /> Save product edits</button>
              </div>

              <div className="assessment-editor">
                <h3><PlusCircle size={18} /> Append assessment</h3>
                <div className="admin-form-grid">
                  <label>Target<select value={assessment.targetType} onChange={(event) => setAssessment({ ...assessment, targetType: event.target.value })}><option value="brand">Brand cruelty-free</option><option value="product">Product vegan</option></select></label>
                  <label>Status<select value={assessment.status} onChange={(event) => setAssessment({ ...assessment, status: event.target.value })}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>Scope<input value={assessment.geographicScope} onChange={(event) => setAssessment({ ...assessment, geographicScope: event.target.value })} /></label>
                  <label>Source type<select value={assessment.sourceType} onChange={(event) => setAssessment({ ...assessment, sourceType: event.target.value })}>{sourceTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>Source URL<input value={assessment.sourceUrl} onChange={(event) => setAssessment({ ...assessment, sourceUrl: event.target.value })} /></label>
                  <label>Reviewer<input value={assessment.reviewer} onChange={(event) => setAssessment({ ...assessment, reviewer: event.target.value })} /></label>
                  <label>Review expiry<input type="date" value={assessment.expiresAt} onChange={(event) => setAssessment({ ...assessment, expiresAt: event.target.value })} /></label>
                </div>
                <label className="csv-editor-label">Summary<textarea value={assessment.summary} onChange={(event) => setAssessment({ ...assessment, summary: event.target.value })} /></label>
                <button onClick={appendAssessment} disabled={loading}><PlusCircle size={16} /> Append history row</button>
              </div>
            </>
          ) : (
            <div className="empty-admin-state"><Database size={30} /><p>Load products and select a row to review.</p></div>
          )}
        </section>
      </section>
    </main>
  );
}
