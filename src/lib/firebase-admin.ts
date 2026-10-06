import "server-only";
import { initializeApp, getApps, cert, ServiceAccount } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  : null;

if (getApps().length === 0 && serviceAccount) {
  initializeApp({
    credential: cert(serviceAccount as ServiceAccount),
  });
}

/**
 * Send push notification to specific device(s)
 */
export async function sendPushNotification(input: {
  tokens: string | string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
}): Promise<void> {
  if (!serviceAccount) {
    console.warn("[Firebase Admin] Service account not configured, skipping push notification");
    return;
  }

  try {
    const tokens = Array.isArray(input.tokens) ? input.tokens : [input.tokens];
    
    const message = {
      notification: {
        title: input.title,
        body: input.body,
      },
      data: input.data ?? {},
      tokens,
      webpush: {
        notification: {
          icon: "/logo.png",
          badge: "/logo.png",
        },
      },
      apns: {
        payload: {
          aps: {
            badge: input.badge ?? 1,
            sound: "default",
          },
        },
      },
    };

    const response = await getMessaging().sendEachForMulticast(message);
    
    console.log(`[Firebase Admin] Push sent successfully: ${response.successCount}/${tokens.length}`);
    
    if (response.failureCount > 0) {
      response.responses.forEach((resp: any, idx: number) => {
        if (!resp.success) {
          console.error(`[Firebase Admin] Failed to send to token ${tokens[idx]}:`, resp.error);
        }
      });
    }
  } catch (err) {
    console.error("[Firebase Admin] Error sending push notification:", err);
  }
}

/**
 * Send notification to topic (e.g., all users, all hosts)
 */
export async function sendTopicNotification(input: {
  topic: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  if (!serviceAccount) {
    console.warn("[Firebase Admin] Service account not configured, skipping topic notification");
    return;
  }

  try {
    const message = {
      notification: {
        title: input.title,
        body: input.body,
      },
      data: input.data ?? {},
      topic: input.topic,
      webpush: {
        notification: {
          icon: "/logo.png",
          badge: "/logo.png",
        },
      },
    };

    await getMessaging().send(message);
    console.log(`[Firebase Admin] Topic notification sent to: ${input.topic}`);
  } catch (err) {
    console.error("[Firebase Admin] Error sending topic notification:", err);
  }
}
