"use client";

import { SCHEMA } from "@/lib/schema.constants";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { mergeNotificationRow } from "@/lib/notificationFeed";
import type { UserNotificationPreferences } from "@/lib/services/notificationPreferences";
import {
  gatedListingId,
  isImportantNotification,
  isNotificationDue,
  msUntilNextDue,
  webRouteForNotification,
  type NotificationRow,
} from "@/lib/notificationRules";

/**
 * Website half of the notification system. Mirrors the app's
 * useRealtimeNotifications + DeviceNotificationBridge:
 *   - one realtime channel per signed-in user on `notifications`
 *     (INSERT -> prepend, UPDATE -> merge, so a read on the app clears it here)
 *   - important rows (bookings / payments) toast + chime immediately
 *   - general rows stay hidden for GENERAL_DELAY_SECONDS, then appear quietly
 *   - host_onboarding rows stay hidden until their listing is live
 */

const HISTORY_LIMIT = 50;
const LISTING_STATUS_LIVE = 1;

type NotificationContextValue = {
  notifications: NotificationRow[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: number) => void;
  markAllAsRead: () => void;
  refresh: () => void;
  preferences: UserNotificationPreferences | null;
};

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  loading: false,
  markAsRead: () => {},
  markAllAsRead: () => {},
  refresh: () => {},
  preferences: null,
});

export const useNotifications = () => useContext(NotificationContext);

function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Browsers can block audio until the user has interacted with the page.
  }
}

export const browserNotificationsGranted = () =>
  typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";

/** Must be called from a click handler -- browsers ignore permission prompts otherwise. */
export async function requestBrowserNotifications(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

/** Which of these listings are live (is_active + status LIVE). Errors count as "not live yet". */
async function fetchLiveListingIds(ids: number[]): Promise<Set<number>> {
  const live = new Set<number>();
  if (!ids.length) return live;
  const { data, error } = await supabase
    .from("listings")
    .select("listing_id")
    .in("listing_id", ids)
    .eq("is_active", true)
    .eq("lisiting_status", LISTING_STATUS_LIVE);
  if (error) {
    console.warn("[notifications] listing status check failed:", error);
    return live;
  }
  for (const r of data ?? []) live.add(Number((r as { listing_id: number }).listing_id));
  return live;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const { preferences } = useNotificationPreferences();
  const generation = useRef(0);
  const preferencesRef = useRef(preferences);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);
  const router = useRouter();
  const [all, setAll] = useState<NotificationRow[] | null>(null);
  const [liveIds, setLiveIds] = useState<Set<number>>(new Set());
  const [tick, setTick] = useState(0);
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const refresh = useCallback(() => {
    if (!userId) return;
    const current = generation.current;
    api
      .notifications()
      .then((rows) => { if (generation.current === current) setAll(rows ?? []); })
      .catch(() => { if (generation.current === current) setAll((curr) => curr ?? []); });
  }, [userId]);

  useEffect(() => {
    generation.current += 1;
    setAll(null);
    refresh();
    return () => { generation.current += 1; };
  }, [refresh]);

  // ── realtime ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const filter = `user_id=eq.${userId}`;
    const channel = supabase
      .channel(`notifications:web:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: SCHEMA.testingSchema, table: "notifications", filter },
        (payload) => {
          const row = payload.new as NotificationRow;
          setAll((prev) => mergeNotificationRow(prev ?? [], row, HISTORY_LIMIT));
          // Same tiering as the app: only important rows interrupt.
          const currentPreferences = preferencesRef.current;
          if (!row.is_read && currentPreferences?.channels.in_app !== false && currentPreferences?.channels.push !== false && isImportantNotification(row.type)) {
            const href = webRouteForNotification(row);
            // Tab in the background: a toast would go unseen, so use an OS notification.
            if (typeof document !== "undefined" && document.hidden && browserNotificationsGranted()) {
              try {
                const sys = new Notification(row.title ?? "Hostiggo", { body: row.message, tag: `hostiggo-${row.id}` });
                sys.onclick = () => {
                  window.focus();
                  if (href) routerRef.current.push(href);
                  sys.close();
                };
              } catch {
                // Some browsers (e.g. Android Chrome) only allow this from a service worker.
              }
            }
            toast(row.title ?? "New notification", {
              description: row.message,
              action: href ? { label: "View", onClick: () => routerRef.current.push(href) } : undefined,
            });
            playNotificationSound();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: SCHEMA.testingSchema, table: "notifications", filter },
        (payload) => {
          const row = payload.new as NotificationRow;
          setAll((prev) => mergeNotificationRow(prev ?? [], row, HISTORY_LIMIT));
        },
      )
      .subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
    const onVisible = () => { if (!document.hidden) refresh(); };
    const timer = window.setInterval(onVisible, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  // ── delay + listing gating (same rules as the app) ──────────────────────
  const list = useMemo(() => all ?? [], [all]);
  useEffect(() => {
    const wait = msUntilNextDue(list);
    if (wait === null) return;
    const t = setTimeout(() => setTick((x) => x + 1), wait + 250);
    return () => clearTimeout(t);
  }, [list, tick]);

  const due = useMemo(
    () => list.filter((n) => isNotificationDue(n)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, tick],
  );

  const gatedKey = useMemo(
    () =>
      [...new Set(due.map(gatedListingId).filter((id): id is number => id != null))]
        .sort((a, b) => a - b)
        .join(","),
    [due],
  );
  useEffect(() => {
    if (!gatedKey) return;
    let cancelled = false;
    fetchLiveListingIds(gatedKey.split(",").map(Number)).then((ids) => {
      if (!cancelled) setLiveIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [gatedKey]);

  const visible = useMemo(
    () =>
      due.filter((n) => {
        if (preferences?.channels.in_app === false) return false;
        const id = gatedListingId(n);
        return id == null || liveIds.has(id);
      }),
    [due, liveIds, preferences],
  );

  const unreadCount = useMemo(() => visible.reduce((acc, n) => (n.is_read ? acc : acc + 1), 0), [visible]);

  // ── read state (optimistic; realtime UPDATE confirms it on every device) ─
  const markAsRead = useCallback((id: number) => {
    setAll((curr) => {
      return (curr ?? []).map((n) => (n.id === id ? { ...n, is_read: true } : n));
    });
    api.markNotificationsRead([id]).catch(refresh);
  }, [refresh]);

  const markAllAsRead = useCallback(() => {
    setAll((curr) => {
      return (curr ?? []).map((n) => ({ ...n, is_read: true }));
    });
    api.markAllNotificationsRead().catch(refresh);
  }, [refresh]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications: visible,
      unreadCount,
      loading: !!userId && all === null,
      markAsRead,
      markAllAsRead,
      refresh,
      preferences,
    }),
    [visible, unreadCount, userId, all, markAsRead, markAllAsRead, refresh, preferences],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
