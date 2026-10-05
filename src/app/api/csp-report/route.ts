import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Receives Content-Security-Policy violation reports (the policy is report-only
// for now, see next.config.js) so they show up in the server logs.
export async function POST(req: NextRequest) {
  const text = (await req.text().catch(() => "")).slice(0, 2000);
  if (text) console.warn("[csp-report]", text);
  return new NextResponse(null, { status: 204 });
}
