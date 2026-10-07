import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const isAuthorized =
    process.env.NODE_ENV !== "production" ||
    (Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    SUREPASS_API_KEY_EXISTS: Boolean(process.env.SUREPASS_API_KEY),
    SUREPASS_API_KEY_LENGTH: process.env.SUREPASS_API_KEY?.length || 0,
    SUREPASS_BASE_URL: process.env.SUREPASS_BASE_URL || "not set",
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "not set",
  });
}
