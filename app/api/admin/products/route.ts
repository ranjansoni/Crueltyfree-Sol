import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const blocked = requireAdmin(request);
  if (blocked) return blocked;

  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const status = request.nextUrl.searchParams.get("status");
  const query = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();

  let builder = supabase
    .from("admin_catalogue_review")
    .select("*")
    .order("brand_name", { ascending: true })
    .limit(100);

  if (status && status !== "all") builder = builder.eq("product_review_status", status);

  const { data, error } = await builder;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const products = query
    ? (data ?? []).filter((product) =>
        [product.brand_name, product.product_name, product.category, product.subcategory]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : data;

  return NextResponse.json({ products });
}

export async function PATCH(request: NextRequest) {
  const blocked = requireAdmin(request);
  if (blocked) return blocked;

  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  let body: {
    productId?: string;
    product?: Record<string, unknown>;
    brand?: { id?: string; name?: string; parent_company?: string | null; website_url?: string | null; review_status?: string };
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.productId) return NextResponse.json({ error: "productId is required." }, { status: 400 });

  if (body.product && Object.keys(body.product).length > 0) {
    const allowed = ["name", "category", "subcategory", "description", "upc", "sku", "review_status", "is_active"];
    const productUpdate = Object.fromEntries(Object.entries(body.product).filter(([key]) => allowed.includes(key)));
    const { error } = await supabase.from("products").update(productUpdate).eq("id", body.productId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.brand?.id) {
    const allowed = ["name", "parent_company", "website_url", "review_status"];
    const brandUpdate = Object.fromEntries(Object.entries(body.brand).filter(([key]) => allowed.includes(key)));
    const { error } = await supabase.from("brands").update(brandUpdate).eq("id", body.brand.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
