import Link from "next/link";
import { ArrowRight, Database, FileUp, ShieldCheck } from "lucide-react";

export default function AdminHome() {
  return (
    <main className="admin-shell">
      <section className="admin-hero">
        <div>
          <span className="overline">KINDR ADMIN</span>
          <h1>Catalogue review</h1>
          <p>Import products, inspect evidence, and keep cruelty-free and vegan assessments separate.</p>
        </div>
        <ShieldCheck size={42} />
      </section>

      <div className="admin-card-grid">
        <Link className="admin-card" href="/admin/imports">
          <FileUp size={24} />
          <div>
            <h2>Import catalogue rows</h2>
            <p>Paste CSV, run validation, then confirm an idempotent import.</p>
          </div>
          <ArrowRight size={18} />
        </Link>
        <Link className="admin-card" href="/admin/products">
          <Database size={24} />
          <div>
            <h2>Review products</h2>
            <p>Edit imported products and append brand/product assessment history.</p>
          </div>
          <ArrowRight size={18} />
        </Link>
      </div>
    </main>
  );
}
