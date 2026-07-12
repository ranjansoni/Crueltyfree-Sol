import { NextRequest, NextResponse } from "next/server";

export function requireAdmin(request: NextRequest) {
  const configuredToken = process.env.ADMIN_ACCESS_TOKEN;
  if (!configuredToken) {
    return NextResponse.json({ error: "Admin access token is not configured." }, { status: 503 });
  }

  const headerToken = request.headers.get("x-admin-token");
  if (headerToken === configuredToken) return null;

  return NextResponse.json({ error: "Admin access token is required." }, { status: 401 });
}
