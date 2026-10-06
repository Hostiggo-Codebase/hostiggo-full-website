"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { SCHEMA } from "@/lib/schema.constants";

let channelId = 0;

export function useCalendarSync(listingId: string | number | null, refresh: () => void | Promise<void>) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!listingId) return;
    const reload = () => { if (!document.hidden) void refreshRef.current(); };
    const channel = supabase.channel(`calendar:${listingId}:${++channelId}`)
      .on("postgres_changes", {
        event: "*", schema: SCHEMA.testingSchema, table: "listing_calendar", filter: `listing_id=eq.${listingId}`,
      }, reload)
      .subscribe((status) => { if (status === "SUBSCRIBED") reload(); });
    // Catch missed events after reconnect and while Realtime is unavailable.
    const timer = window.setInterval(reload, 15000);
    document.addEventListener("visibilitychange", reload);
    window.addEventListener("online", reload);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", reload);
      window.removeEventListener("online", reload);
      void supabase.removeChannel(channel);
    };
  }, [listingId]);
}
