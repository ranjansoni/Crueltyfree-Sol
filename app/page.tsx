"use client";

import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  ExternalLink,
  Heart,
  Leaf,
  MapPin,
  Menu,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CATEGORIES, CERTIFICATIONS, Country, Product, PRODUCTS } from "./data";

const countryLabel: Record<Country, string> = { CA: "Canada", US: "United States" };

function money(product: Product, country: Country) {
  const offer = product.prices[country];
  return new Intl.NumberFormat(country === "CA" ? "en-CA" : "en-US", {
    style: "currency",
    currency: offer.currency,
  }).format(offer.price);
}

function ProductArt({ product, compact = false }: { product: Product; compact?: boolean }) {
  return (
    <div className={`product-art ${compact ? "compact" : ""}`} style={{ background: product.colour, color: product.accent }}>
      <span className="art-brand">{product.brand}</span>
      <div className="bottle" aria-hidden="true">
        <span />
      </div>
      <span className="art-kind">{product.subcategory}</span>
    </div>
  );
}

function VoteControls({ product }: { product: Product }) {
  const [score, setScore] = useState(product.votes);
  const [vote, setVote] = useState<-1 | 0 | 1>(0);

  async function cast(next: -1 | 1) {
    const old = vote;
    const resolved = old === next ? 0 : next;
    setVote(resolved);
    setScore((value) => value - old + resolved);

    let voterId = localStorage.getItem("kindr_voter_id");
    if (!voterId) {
      voterId = crypto.randomUUID();
      localStorage.setItem("kindr_voter_id", voterId);
    }

    try {
      await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, vote: resolved, voterId }),
      });
    } catch {
      // The optimistic vote remains useful in demo mode.
    }
  }

  return (
    <div className="vote-control" aria-label={`Community score ${score}`}>
      <button className={vote === 1 ? "active" : ""} onClick={() => cast(1)} aria-label={`Upvote ${product.name}`}>
        <ThumbsUp size={15} />
      </button>
      <span>{score}</span>
      <button className={vote === -1 ? "active down" : ""} onClick={() => cast(-1)} aria-label={`Downvote ${product.name}`}>
        <ThumbsDown size={15} />
      </button>
    </div>
  );
}

function ShareButton({ product, onShared }: { product: Product; onShared: () => void }) {
  async function share() {
    const data = {
      title: `${product.name} by ${product.brand}`,
      text: `A cruelty-free find: ${product.name} by ${product.brand}`,
      url: `${window.location.origin}/?product=${product.id}`,
    };
    if (navigator.share) await navigator.share(data).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(`${data.text} — ${data.url}`);
      onShared();
    }
  }

  return (
    <button className="icon-button" onClick={share} aria-label={`Share ${product.name}`} title="Share product">
      <Share2 size={17} />
    </button>
  );
}

function ProductCard({ product, country, onSelect, onShared }: { product: Product; country: Country; onSelect: () => void; onShared: () => void }) {
  const offer = product.prices[country];
  return (
    <article className="product-card">
      <div className="card-art-wrap">
        <ProductArt product={product} />
        <div className="card-badge"><BadgeCheck size={13} /> {product.badges[0]}</div>
        <div className="card-share"><ShareButton product={product} onShared={onShared} /></div>
      </div>
      <div className="card-content">
        <div className="eyebrow-row">
          <span>{product.brand}</span>
          <span className="rating"><Star size={13} fill="currentColor" /> {product.rating}</span>
        </div>
        <button className="product-title" onClick={onSelect}>{product.name}</button>
        <p>{product.subcategory} · {product.certifications.join(" + ")}</p>
        <div className="card-price-row">
          <div><strong>{money(product, country)}</strong><span> est.</span></div>
          <VoteControls product={product} />
        </div>
        <div className="store-line"><MapPin size={14} /> Likely at {offer.stores[0]}</div>
        <button className="text-link" onClick={onSelect}>See details <ArrowRight size={14} /></button>
      </div>
    </article>
  );
}

export default function Home() {
  const [country, setCountry] = useState<Country>("CA");
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState("All");
  const [certification, setCertification] = useState("All standards");
  const [budget, setBudget] = useState("Any price");
  const [sort, setSort] = useState("Best match");
  const [selected, setSelected] = useState<Product | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = localStorage.getItem("kindr_country") as Country | null;
      if (saved === "US" || saved === "CA") setCountry(saved);
      const requested = new URLSearchParams(window.location.search).get("product");
      if (requested) setSelected(PRODUCTS.find((item) => item.id === requested) ?? null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function changeCountry(next: Country) {
    setCountry(next);
    localStorage.setItem("kindr_country", next);
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearchTerm(query.trim());
    document.getElementById("catalogue")?.scrollIntoView({ behavior: "smooth" });
  }

  const visibleProducts = useMemo(() => {
    const q = searchTerm.toLowerCase();
    let result = PRODUCTS.filter((product) => {
      const text = [product.name, product.brand, product.category, product.subcategory, ...product.tags].join(" ").toLowerCase();
      return (!q || text.includes(q))
        && (category === "All" || product.category === category)
        && (certification === "All standards" || product.certifications.includes(certification))
        && (budget === "Any price" || product.prices[country].price <= Number(budget));
    });
    result = [...result].sort((a, b) => {
      if (sort === "Price: low to high") return a.prices[country].price - b.prices[country].price;
      if (sort === "Top rated") return b.rating - a.rating;
      if (sort === "Community score") return b.votes - a.votes;
      return Number(b.badges.includes("Best value")) - Number(a.badges.includes("Best value")) || b.votes - a.votes;
    });
    return result;
  }, [budget, category, certification, country, searchTerm, sort]);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Kindr home"><span className="brand-mark"><Leaf size={18} /></span> kindr<span>.</span></a>
        <nav className={menuOpen ? "open" : ""}>
          <a href="#finder" onClick={() => setMenuOpen(false)}>Find a swap</a>
          <a href="#catalogue" onClick={() => setMenuOpen(false)}>Catalogue</a>
          <a href="#standards" onClick={() => setMenuOpen(false)}>Our standards</a>
        </nav>
        <div className="header-actions">
          <label className="country-select"><MapPin size={15} /><span className="sr-only">Country</span>
            <select value={country} onChange={(event) => changeCountry(event.target.value as Country)}>
              <option value="CA">Canada</option><option value="US">United States</option>
            </select><ChevronDown size={14} />
          </label>
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="kicker"><Sparkles size={15} /> KINDER CHOICES, SMALLER PRICES</div>
          <h1>Find the kind<br />alternative.</h1>
          <p>Tell us what you usually buy. We’ll find an affordable cruelty-free swap available near you.</p>
          <form className="hero-search" onSubmit={submitSearch} id="finder">
            <Search size={21} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try ‘mascara’ or ‘body wash’" aria-label="Product to replace" />
            <button type="submit">Find my swap <ArrowRight size={17} /></button>
          </form>
          <div className="quick-searches"><span>Popular:</span>{["Mascara", "Shampoo", "Cleaner"].map((item) => <button key={item} onClick={() => { setQuery(item); setSearchTerm(item); document.getElementById("catalogue")?.scrollIntoView({ behavior: "smooth" }); }}>{item}</button>)}</div>
          <div className="trust-row">
            <div><ShieldCheck size={20} /><span><strong>Verified standards</strong><small>Clear certification notes</small></span></div>
            <div><MapPin size={20} /><span><strong>Local prices</strong><small>{countryLabel[country]} retailers</small></span></div>
            <div><Heart size={20} /><span><strong>Community tested</strong><small>Real upvotes and reviews</small></span></div>
          </div>
        </div>
        <div className="hero-visual" aria-label="Featured cruelty-free swaps">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="feature-card feature-main">
            <ProductArt product={PRODUCTS[2]} compact />
            <div><span className="mini-label">A KINDER SWAP</span><strong>{PRODUCTS[2].name}</strong><small>from {money(PRODUCTS[2], country)}</small></div>
          </div>
          <div className="feature-card feature-small one"><BadgeCheck size={19} /><span><strong>100% cruelty-free</strong><small>Brand policy checked</small></span></div>
          <div className="feature-card feature-small two"><span className="score-circle">94</span><span><strong>Loved by locals</strong><small>Community score</small></span></div>
          <div className="maple-badge">🍁<span>CANADA<br />FIRST</span></div>
        </div>
      </section>

      <section className="proof-strip" id="standards">
        <span>OUR CHECKLIST</span>
        <div><Check size={15} /> No animal testing</div><div><Check size={15} /> Parent company shown</div><div><Check size={15} /> Certification source</div><div><Check size={15} /> Price checked by region</div>
      </section>

      <section className="catalogue" id="catalogue">
        <div className="section-heading">
          <div><span className="overline">THE KINDR CATALOGUE</span><h2>{searchTerm ? `Swaps for “${searchTerm}”` : "Small swaps. Real impact."}</h2><p>Affordable, community-ranked picks available in {countryLabel[country]}.</p></div>
          <div className="result-count"><strong>{visibleProducts.length}</strong> products found</div>
        </div>

        <div className="catalogue-toolbar">
          <div className="category-pills">{CATEGORIES.map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div>
          <div className="filter-row">
            <label><ShieldCheck size={15} /><select value={certification} onChange={(event) => setCertification(event.target.value)}>{CERTIFICATIONS.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></label>
            <label><SlidersHorizontal size={15} /><select value={budget} onChange={(event) => setBudget(event.target.value)}><option>Any price</option><option value="10">Under $10</option><option value="15">Under $15</option><option value="20">Under $20</option></select><ChevronDown size={13} /></label>
            <label className="sort-label">Sort: <select value={sort} onChange={(event) => setSort(event.target.value)}><option>Best match</option><option>Price: low to high</option><option>Top rated</option><option>Community score</option></select><ChevronDown size={13} /></label>
          </div>
        </div>

        {visibleProducts.length ? <div className="product-grid">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} country={country} onSelect={() => setSelected(product)} onShared={() => notify("Product link copied") } />)}</div> : <div className="empty-state"><Search size={28} /><h3>No exact match yet</h3><p>Try a category like “skin care,” or clear one of your filters.</p><button onClick={() => { setSearchTerm(""); setQuery(""); setCategory("All"); setCertification("All standards"); setBudget("Any price"); }}>Clear filters</button></div>}

        <div className="catalogue-note"><Leaf size={18} /><p><strong>Prices are estimates, not promises.</strong> Retail prices and stock move quickly. We show the most likely store and let the community help keep suggestions useful.</p></div>
      </section>

      <section className="mission">
        <div><span className="overline">WHY KINDR?</span><h2>Better choices shouldn’t cost more.</h2></div>
        <p>We compare the practical things that matter—price, availability and trustworthy cruelty-free standards—so shopping with your values feels easy.</p>
        <a href="#finder">Find a kinder swap <ArrowRight size={16} /></a>
      </section>

      <footer>
        <a className="brand" href="#top"><span className="brand-mark"><Leaf size={18} /></span> kindr<span>.</span></a>
        <p>Helping North Americans shop a little kinder.</p>
        <div><a href="#catalogue">Catalogue</a><a href="#standards">Standards</a><a href="mailto:hello@kindr.guide">Suggest a product</a></div>
        <small>© 2026 Kindr Guide · Prices shown in {country === "CA" ? "CAD" : "USD"}</small>
      </footer>

      {selected && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelected(null); }}>
        <article className="product-modal" role="dialog" aria-modal="true" aria-label={selected.name}>
          <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close details"><X size={20} /></button>
          <ProductArt product={selected} />
          <div className="modal-copy">
            <span className="overline">{selected.brand} · {selected.category}</span>
            <h2>{selected.name}</h2>
            <div className="modal-rating"><Star size={15} fill="currentColor" /> {selected.rating} from {selected.reviews} community ratings</div>
            <p>{selected.description}</p>
            <div className="cert-list">{selected.certifications.map((cert) => <span key={cert}><BadgeCheck size={15} /> {cert}</span>)}</div>
            <div className="buy-box">
              <div><small>Expected price</small><strong>{money(selected, country)}</strong><span>{selected.prices[country].currency}</span></div>
              <div><small>Likely available at</small><strong>{selected.prices[country].stores[0]}</strong><span>{selected.prices[country].stores.slice(1).join(" · ")}</span></div>
            </div>
            <div className="modal-actions"><button className="primary-button" onClick={() => notify("Retail links can be connected in Supabase")}><ExternalLink size={16} /> Check retailer</button><ShareButton product={selected} onShared={() => notify("Product link copied")} /><VoteControls product={selected} /></div>
            <small className="disclaimer">Always confirm current stock and the brand’s latest animal-testing policy before purchasing.</small>
          </div>
        </article>
      </div>}

      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </main>
  );
}
