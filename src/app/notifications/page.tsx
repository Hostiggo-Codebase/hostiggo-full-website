"use client";

import { Bell, BellRing, CheckCheck, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  browserNotificationsGranted,
  requestBrowserNotifications,
  useNotifications,
} from "@/context/NotificationContext";
import { bookingIdOf, webRouteForNotification, type NotificationRow } from "@/lib/notificationRules";
import BookingRequestCard from "@/components/features/BookingRequestCard";
import Navbar from "@/components/layout/Navbar";

export default function NotificationsPage() {
  const router = useRouter();
  const { loading: authLoading, userId } = useAuth();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();

  // Offer desktop alerts so bookings reach the host even when this tab is in the background.
  const [canAskDesktop, setCanAskDesktop] = useState(false);
  useEffect(() => {
    setCanAskDesktop(
      typeof window !== "undefined" && "Notification" in window && Notification.permission === "default",
    );
  }, []);
  const enableDesktop = async () => {
    await requestBrowserNotifications();
    setCanAskDesktop(!browserNotificationsGranted() && Notification.permission === "default");
  };

  const open = (n: NotificationRow) => {
    if (!n.is_read) markAsRead(n.id);
    const href = webRouteForNotification(n);
    if (href) router.push(href);
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-8">
        <section className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <Bell className="h-5 w-5 text-figma-navy" />
            <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-figma-navy hover:bg-figma-navy/5"
              >
                <CheckCheck className="h-4 w-4" /> Mark all read
              </button>
            )}
          </div>
          {canAskDesktop && (
            <button
              type="button"
              onClick={enableDesktop}
              className="mb-6 flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              <BellRing className="h-4 w-4 shrink-0 text-figma-navy" />
              Turn on desktop alerts to hear about new bookings while this tab is in the background.
            </button>
          )}
          {authLoading || loading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
          ) : notifications.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">Your inbox is empty.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((n) => {
                // A paid request waiting on the host: accept / decline right here.
                const requestBookingId =
                  n.type === "booking_host" && n.metadata?.kind === "booking_request" && userId
                    ? bookingIdOf(n)
                    : null;
                return (
                  <div key={n.id} className="py-4 first:pt-0 last:pb-0">
                    <button type="button" onClick={() => open(n)} className="flex w-full items-start gap-3 text-left">
                      <span
                        aria-hidden
                        className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-figma-navy"}`}
                      />
                      <span className="min-w-0">
                        <span className={`block text-gray-900 ${n.is_read ? "font-normal" : "font-semibold"}`}>
                          {n.title}
                        </span>
                        <span className="mt-1 block text-sm text-gray-600">{n.message}</span>
                        {n.created_at && (
                          <time className="mt-2 block text-xs text-gray-400">
                            {new Date(n.created_at).toLocaleString("en-IN")}
                          </time>
                        )}
                      </span>
                    </button>
                    {requestBookingId && userId && (
                      <div className="pl-5">
                        <BookingRequestCard bookingId={requestBookingId} userId={userId} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
