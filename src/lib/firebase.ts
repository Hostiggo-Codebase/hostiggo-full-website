import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

let messaging: ReturnType<typeof getMessaging> | null = null;

export async function getFirebaseMessaging() {
  if (typeof window === "undefined") return null;
  
  const supported = await isSupported();
  if (!supported) {
    console.warn("[Firebase] Messaging not supported in this browser");
    return null;
  }
  
  if (!messaging) {
    messaging = getMessaging(app);
  }
  return messaging;
}

export async function requestNotificationPermission(): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[Firebase] Notification permission denied");
      return null;
    }

    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    });

    console.log("[Firebase] FCM token obtained:", token.substring(0, 20) + "...");
    return token;
  } catch (err) {
    console.error("[Firebase] Error getting token:", err);
    return null;
  }
}

export async function onMessageListener() {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    console.log("[Firebase] Message received:", payload);
    
    // Show browser notification
    if (payload.notification) {
      new Notification(payload.notification.title || "Hostiggo", {
        body: payload.notification.body,
        icon: "/logo.png",
        badge: "/logo.png",
        data: payload.data,
      });
    }
  });
}

export { app };
