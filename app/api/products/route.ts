import { NextRequest, NextResponse } from "next/server";
import { PRODUCTS } from "@/app/data";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country") === "US" ? "US" : "CA";
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const category = request.nextUrl.searchParams.get("category")?.trim();
  const supabase = getServerSupabase();

  if (!supabase) {
    const q = query.toLowerCase();
    const products = PRODUCTS.filter((product) => {
      const searchable = [product.name, product.brand, product.category, ...product.tags].join(" ").toLowerCase();
      return (!q || searchable.includes(q)) && (!category || category === "All" || product.category === category);
    });
    return NextResponse.json({ products, country, mode: "demo" });
  }

  let builder = supabase
    .from("product_catalogue")
    .select("*")
    .eq("country_code", country)
    .eq("is_active", true)
    .order("community_score", { ascending: false })
    .limit(60);

  if (query) builder = builder.textSearch("search_document", query, { type: "websearch", config: "english" });
  if (category && category !== "All") builder = builder.eq("category", category);

  const { data, error } = await builder;
  if (error) return NextResponse.json({ error: "Catalogue could not be loaded" }, { status: 500 });
  return NextResponse.json({ products: data, country, mode: "live" });
}
