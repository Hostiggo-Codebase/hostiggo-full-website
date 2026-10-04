import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * One notification_preferences row per user, shared with the mobile app
 * (hostiggo-frontend/src/data/infra/supabase/notificationApi.ts). Keep the
 * channel set and defaults identical on both sides -- `push` is only acted on
 * by the app, `whatsapp` / `sms` only by the website, but each side must
 * preserve the other's keys when it saves.
 */
export type NotificationChannel = "in_app" | "push" | "email" | "whatsapp" | "sms";
export type NotificationCategory = "bookings" | "account" | "marketing";

export interface UserNotificationPreferences {
  channels: Record<NotificationChannel, boolean>;
  categories: Record<NotificationCategory, boolean>;
}

export const DEFAULT_PREFERENCES: UserNotificationPreferences = {
  channels: {
    in_app: true,
    push: true,
    email: true,
    whatsapp: true,
    sms: false,
  },
  categories: {
    bookings: true,
    account: true,
    marketing: false,
  },
};

export async function getNotificationPreferences(
  userId: string
): Promise<UserNotificationPreferences> {
  const { data, error } = await supabaseAdmin
    .from("notification_preferences")
    .select("channels, categories")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[notificationPreferences] Query error:", error);
    return DEFAULT_PREFERENCES;
  }

  if (!data) {
    // Create default preferences for user
    const { error: insertError } = await supabaseAdmin
      .from("notification_preferences")
      .insert({
        user_id: userId,
        channels: DEFAULT_PREFERENCES.channels,
        categories: DEFAULT_PREFERENCES.categories,
      });
    
    if (insertError) {
      console.error("[notificationPreferences] Insert error:", insertError);
    }
    
    return DEFAULT_PREFERENCES;
  }

  // Merge with defaults to ensure all channels exist
  return {
    channels: { ...DEFAULT_PREFERENCES.channels, ...(data.channels ?? {}) },
    categories: { ...DEFAULT_PREFERENCES.categories, ...(data.categories ?? {}) },
  };
}

export async function updateNotificationPreferences(
  userId: string,
  updates: Partial<UserNotificationPreferences>
): Promise<UserNotificationPreferences> {
  const current = await getNotificationPreferences(userId);

  const updated: UserNotificationPreferences = {
    channels: { ...current.channels, ...(updates.channels ?? {}) },
    categories: { ...current.categories, ...(updates.categories ?? {}) },
  };

  const { error } = await supabaseAdmin
    .from("notification_preferences")
    .upsert(
      {
        user_id: userId,
        channels: updated.channels,
        categories: updated.categories,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[notificationPreferences] Update error:", error);
    throw error;
  }

  return updated;
}

export async function isChannelEnabled(
  userId: string,
  channel: NotificationChannel
): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  return prefs.channels[channel] ?? DEFAULT_PREFERENCES.channels[channel];
}

export async function isCategoryEnabled(
  userId: string,
  category: NotificationCategory
): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  return prefs.categories[category] ?? DEFAULT_PREFERENCES.categories[category];
}

