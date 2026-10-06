"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { SCHEMA } from "@/lib/schema.constants";
import type { UserNotificationPreferences } from "@/lib/services/notificationPreferences";

export function useNotificationPreferences() {
  const { userId } = useAuth();
  const [preferences, setPreferences] = useState<UserNotificationPreferences | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(() => {
    if (!userId) return;
    const current = generation.current;
    void api.notificationPreferences().then((next) => {
      if (generation.current === current) setPreferences(next);
    }).catch((error) => console.warn("[notifications] preferences refresh failed:", error));
  }, [userId]);

  useEffect(() => {
    generation.current += 1;
    setPreferences(null);
    if (!userId) return;
    refresh();
    const channel = supabase.channel(`notification-preferences:web:${userId}`)
      .on("postgres_changes", {
        event: "*", schema: SCHEMA.testingSchema,
        table: "notification_preferences", filter: `user_id=eq.${userId}`,
      }, refresh)
      .subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
    const onVisible = () => { if (!document.hidden) refresh(); };
    const timer = window.setInterval(onVisible, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      generation.current += 1;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return { preferences, refresh };
}
