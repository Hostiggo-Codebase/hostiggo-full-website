import "server-only";
import * as admin from "firebase-admin";

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  : null;

if (!admin.apps.length && serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const firebaseAdmin = admin;

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
    
    const message: admin.messaging.MulticastMessage = {
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

    const response = await admin.messaging().sendMulticast(message);
    
    console.log(`[Firebase Admin] Push sent successfully: ${response.successCount}/${tokens.length}`);
    
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
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
    const message: admin.messaging.Message = {
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

    await admin.messaging().send(message);
    console.log(`[Firebase Admin] Topic notification sent to: ${input.topic}`);
  } catch (err) {
    console.error("[Firebase Admin] Error sending topic notification:", err);
  }
}
