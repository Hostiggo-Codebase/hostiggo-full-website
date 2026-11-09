// Live support chat (Socket.IO, the admin portal's server). Same events and payloads as the mobile app.
// Pure message-merging logic lives here so it can be unit-tested without a socket.

// The env var wins; this is the production socket service (Railway) so the chat still works if it is unset.
export const SUPPORT_CHAT_FALLBACK_URL = "https://hostiggoadminportal-production.up.railway.app";
export const SUPPORT_CHAT_URL = process.env.NEXT_PUBLIC_SUPPORT_CHAT_URL || SUPPORT_CHAT_FALLBACK_URL;

export const SUPPORT_EVENTS = {
  joinTicket: "join_ticket",
  sendMessage: "send_message",
  newMessage: "new_message",
} as const;

/** chat_messages.sender_type only allows user | agent | system; customers are always `user`. */
export const SUPPORT_SENDER_TYPE = "user" as const;

export interface SupportPayload {
  id?: string;
  ticket_id?: string;
  sender_id: string;
  sender_type: "user" | "agent" | "system";
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
  /** Never confirmed by the server; the customer can retry it. */
  failed?: boolean;
}

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
  const fromUser = payload.sender_id === userId && payload.sender_type === "user";
  const confirmed: SupportMessage = {
    id: payload.id ?? `srv-${payload.created_at ?? Date.now()}-${payload.sender_id}`,
    fromUser,
    text: payload.body,
    at: payload.created_at ?? new Date().toISOString(),
  };
  if (prev.some((m) => m.id === confirmed.id && !m.pending && !m.failed)) return prev;
  if (fromUser) {
    const i = prev.findIndex((m) => (m.pending || m.failed) && m.text === payload.body);
    if (i >= 0) {
      const next = prev.slice();
      next[i] = confirmed;
      return next;
    }
  }
  return [...prev, confirmed];
}

/** Turns a stored chat_messages row into a confirmed message (null for internal notes and empty bodies). */
export function fromRow(row: SupportPayload, userId: string): SupportMessage | null {
  if (!row?.body?.trim() || row.is_internal_note) return null;
  return {
    id: row.id ?? `srv-${row.created_at}-${row.sender_id}`,
    fromUser: row.sender_id === userId && row.sender_type === "user",
    text: row.body,
    at: row.created_at ?? new Date().toISOString(),
  };
}

/** Stored history plus our own messages the server has not confirmed yet (matched by text, one for one). */
export function mergeHistory(prev: SupportMessage[], history: SupportMessage[]): SupportMessage[] {
  const unmatched = history.filter((m) => m.fromUser);
  const unconfirmed = prev
    .filter((m) => m.pending || m.failed)
    .filter((local) => {
      const i = unmatched.findIndex((m) => m.text === local.text);
      if (i < 0) return true;
      unmatched.splice(i, 1);
      return false;
    });
  return [...history, ...unconfirmed].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export const markFailed = (prev: SupportMessage[], id: string): SupportMessage[] =>
  prev.map((m) => (m.id === id && m.pending ? { ...m, pending: false, failed: true } : m));

export const markPending = (prev: SupportMessage[], id: string): SupportMessage[] =>
  prev.map((m) => (m.id === id && m.failed ? { ...m, failed: false, pending: true } : m));
