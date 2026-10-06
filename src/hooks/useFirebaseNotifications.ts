"use client";

import { useEffect, useState } from "react";
import { requestNotificationPermission, onMessageListener } from "@/lib/firebase";

export function useFirebaseNotifications(userId: string | null) {
  const [token, setToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<any>(null);

  useEffect(() => {
    if (!userId) return;

    // Request permission and get FCM token
    const initializeNotifications = async () => {
      try {
        const fcmToken = await requestNotificationPermission();
        if (fcmToken) {
          setToken(fcmToken);

          // Save token to backend
          await fetch("/api/fcm/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: fcmToken,
              platform: "web",
              deviceId: navigator.userAgent,
            }),
          });

          console.log("[Firebase] Token saved to backend");
        }
      } catch (err) {
        console.error("[Firebase] Error initializing notifications:", err);
      }
    };

    initializeNotifications();

    // Listen for foreground messages
    const unsubscribe = onMessageListener().then((unsub) => {
      return unsub;
    });

    return () => {
      unsubscribe.then((unsub) => {
        if (typeof unsub === "function") unsub();
      });
    };
  }, [userId]);

  return { token, notification };
}
