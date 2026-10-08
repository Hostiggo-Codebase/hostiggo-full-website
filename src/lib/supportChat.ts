// Live support chat (Socket.IO, the admin portal's server). Same events and payloads as the mobile app.
// Pure message-merging logic lives here so it can be unit-tested without a socket.

export const SUPPORT_CHAT_URL =
  process.env.NEXT_PUBLIC_SUPPORT_CHAT_URL || "https://hostiggoadminportal-production.up.railway.app";

export const SUPPORT_EVENTS = {
  joinTicket: "join_ticket",
  sendMessage: "send_message",
  newMessage: "new_message",
} as const;

/** Customers are always `student` in the ticket schema; `agent` is the support team. */
export const SUPPORT_SENDER_TYPE = "student" as const;

export interface SupportPayload {
  id?: string;
  ticket_id?: string;
  sender_id: string;
  sender_type: "student" | "agent";
  body: string;
  is_internal_note?: boolean;
  created_at?: string;
}

export interface SupportMessage {
  id: string;
  fromUser: boolean;
  text: string;
  at: string;
  /** Sent from this page but the server has not echoed it back yet. */
  pending?: boolean;
}

/**
 * Each person gets their own private room, named after their user id. (The app used the literal id "support" when a
 * user had no thread, which put every such user in one shared room.)
 */
export const ticketIdForUser = (userId: string): string => userId;

export function addOptimistic(prev: SupportMessage[], text: string, id: string, at = new Date().toISOString()): SupportMessage[] {
  return [...prev, { id, fromUser: true, text, at, pending: true }];
}

/**
 * Folds a `new_message` event into the list. The server echoes our own message back to us, so an echo replaces the
 * matching pending message instead of showing the message twice; a message from our other device (no pending match)
 * is appended; internal notes and empty bodies are dropped; the same id never appears twice.
 */
export function applyIncoming(prev: SupportMessage[], payload: SupportPayload, userId: string): SupportMessage[] {
  if (!payload?.body?.trim() || payload.is_internal_note) return prev;
  const fromUser = payload.sender_id === userId && payload.sender_type !== "agent";
  const confirmed: SupportMessage = {
    id: payload.id ?? `srv-${payload.created_at ?? Date.now()}-${payload.sender_id}`,
    fromUser,
    text: payload.body,
    at: payload.created_at ?? new Date().toISOString(),
  };
  if (prev.some((m) => m.id === confirmed.id && !m.pending)) return prev;
  if (fromUser) {
    const i = prev.findIndex((m) => m.pending && m.text === payload.body);
    if (i >= 0) {
      const next = prev.slice();
      next[i] = confirmed;
      return next;
    }
  }
  return [...prev, confirmed];
}
