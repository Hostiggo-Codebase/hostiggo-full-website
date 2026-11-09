import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUserId } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;

    // The phone lives only on the Supabase Auth user.
    const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const authPhone = authData.user?.phone ?? null;
    return NextResponse.json({ authPhone, hasPhone: Boolean(authPhone) });
  } catch (err) {
    console.error("[/api/user/phone] GET error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
