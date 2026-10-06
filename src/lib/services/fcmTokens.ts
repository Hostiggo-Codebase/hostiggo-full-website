import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Store or update FCM token for a user
 * Supports both web and mobile app tokens
 */
export async function saveFCMToken(input: {
  userId: string;
  token: string;
  platform: "web" | "ios" | "android";
  deviceId?: string;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("fcm_tokens").upsert(
      {
        user_id: input.userId,
        token: input.token,
        platform: input.platform,
        device_id: input.deviceId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_id" }
    );

    if (error) throw error;
    console.log(`[FCM] Token saved for user ${input.userId} on ${input.platform}`);
  } catch (err) {
    console.error("[FCM] Error saving token:", err);
  }
}

/**
 * Get all active FCM tokens for a user
 */
export async function getUserFCMTokens(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("fcm_tokens")
      .select("token")
      .eq("user_id", userId)
      .gte("updated_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()); // Last 90 days

    if (error) throw error;
    return data?.map((row) => row.token) ?? [];
  } catch (err) {
    console.error("[FCM] Error fetching tokens:", err);
    return [];
  }
}

/**
 * Remove invalid/expired FCM token
 */
export async function removeFCMToken(token: string): Promise<void> {
  try {
    await supabaseAdmin.from("fcm_tokens").delete().eq("token", token);
    console.log(`[FCM] Removed invalid token: ${token.substring(0, 20)}...`);
  } catch (err) {
    console.error("[FCM] Error removing token:", err);
  }
}
