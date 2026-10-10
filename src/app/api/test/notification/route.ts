import { NextRequest, NextResponse } from "next/server";
import { notify } from "@/lib/services/notifications";
import { sendPushNotification } from "@/lib/firebase-admin";
import { getUserFCMTokens } from "@/lib/services/fcmTokens";

/**
 * Test notification endpoint
 * Send a test notification to verify push notifications work
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { userId, title, message, sendPush } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const notificationTitle = title || "Test Notification";
    const notificationMessage = message || "This is a test notification from Hostiggo";

    // Send in-app notification
    await notify({
      userId,
      title: notificationTitle,
      message: notificationMessage,
      type: "booking_guest",
      category: "bookings",
      metadata: { test: true },
    });

    let pushSent = false;
    let tokenCount = 0;

    // Optionally send push notification
    if (sendPush !== false) {
      const tokens = await getUserFCMTokens(userId);
      tokenCount = tokens.length;

      if (tokens.length > 0) {
        await sendPushNotification({
          tokens,
          title: notificationTitle,
          body: notificationMessage,
          data: { type: "test", test: "true" },
        });
        pushSent = true;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Notification sent",
      inAppSent: true,
      pushSent,
      tokenCount,
    });
  } catch (err: any) {
    console.error("[Test Notification] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
