import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { saveFCMToken, removeFCMToken } from "@/lib/services/fcmTokens";

/**
 * Save FCM token for current user
 * Called from web app and mobile app
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token, platform, deviceId } = await req.json();

    if (!token || !platform) {
      return NextResponse.json(
        { error: "Missing token or platform" },
        { status: 400 }
      );
    }

    await saveFCMToken({
      userId: user.id,
      token,
      platform,
      deviceId,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[FCM Token API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Remove FCM token
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    await removeFCMToken(token);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[FCM Token API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
