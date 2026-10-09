"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { supabase } from "@/lib/supabase";
import {
  SUPPORT_CHAT_URL,
  SUPPORT_EVENTS,
  SUPPORT_SENDER_TYPE,
  addOptimistic,
  applyIncoming,
  fromRow,
  markFailed,
  markPending,
  mergeHistory,
  type SupportMessage,
  type SupportPayload,
} from "@/lib/supportChat";

// A sent message that the server has not echoed back after this long is shown as failed.
const SEND_TIMEOUT_MS = 12_000;

// Support tables live in the `public` schema; the site client defaults to the app schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const publicDb = () => (supabase as any).schema("public");

/**
 * Live support chat over the admin portal's Socket.IO server. One support ticket (public.support_tickets row)
 * per conversation: the customer's open ticket is reused, or created on their first message so just opening the
 * page never fills the agents' queue. History comes from public.chat_messages. Reconnects by itself.
 */
export function useSupportChat(userId: string | null | undefined, enabled = true) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [ticketId, setTicketId] = useState<string | undefined>();
  const socketRef = useRef<Socket | null>(null);
  const ticketIdRef = useRef<string | undefined>(undefined);
  const creatingRef = useRef<Promise<string> | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    ticketIdRef.current = ticketId;
  }, [ticketId]);

  const loadHistory = useCallback(
    async (id: string) => {
      if (!userId) return;
      const { data, error } = await publicDb()
        .from("chat_messages")
        .select("id, ticket_id, sender_id, sender_type, body, is_internal_note, created_at")
        .eq("ticket_id", id)
        .eq("is_internal_note", false)
        .order("created_at", { ascending: true });
      if (error) {
        console.warn("[support-chat] history load failed:", error.message);
        return;
      }
      if (ticketIdRef.current !== id) return;
      const history = ((data ?? []) as SupportPayload[])
        .map((r) => fromRow(r, userId))
        .filter((m): m is SupportMessage => m !== null);
      setMessages((prev) => mergeHistory(prev, history));
    },
    [userId],
  );

  // Find the customer's open ticket.
  useEffect(() => {
    if (!userId || !enabled || ticketId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await publicDb()
        .from("support_tickets")
        .select("ticket_id")
        .eq("user_id", userId)
        .neq("status", "CLOSED")
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (error) {
        console.warn("[support-chat] ticket lookup failed:", error.message);
        return;
      }
      const found = data?.[0]?.ticket_id as string | undefined;
      if (found) setTicketId(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, enabled, ticketId]);

  // Join the ticket's room and load its history once the ticket is known.
  useEffect(() => {
    if (!userId || !enabled || !ticketId) return;
    if (socketRef.current?.connected) socketRef.current.emit(SUPPORT_EVENTS.joinTicket, { ticket_id: ticketId });
    void loadHistory(ticketId);
  }, [userId, enabled, ticketId, loadHistory]);

  useEffect(() => {
    if (!userId || !enabled) return;
    let cancelled = false;
    const timers = timersRef.current;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const socket = io(SUPPORT_CHAT_URL, {
        transports: ["websocket"],
        // The session token goes in the handshake so the server can verify us as soon as it enforces auth.
        auth: { token: data.session?.access_token, userId },
        reconnectionDelay: 1500,
        reconnectionDelayMax: 30_000,
      });
      socketRef.current = socket;
      socket.on("connect", () => {
        setConnected(true);
        // Rooms are lost on reconnect: rejoin, and catch up on anything missed while offline.
        const id = ticketIdRef.current;
        if (id) {
          socket.emit(SUPPORT_EVENTS.joinTicket, { ticket_id: id });
          void loadHistory(id);
        }
      });
      socket.on("disconnect", () => setConnected(false));
      socket.on("connect_error", () => setConnected(false));
      socket.on(SUPPORT_EVENTS.newMessage, (payload: SupportPayload) => {
        if (payload.ticket_id !== ticketIdRef.current) return;
        setMessages((prev) => {
          const next = applyIncoming(prev, payload, userId);
          // An echo confirmed a send: stop that message's failure timer.
          prev
            .filter((m) => (m.pending || m.failed) && !next.includes(m))
            .forEach((m) => {
              const t = timers.get(m.id);
              if (t) clearTimeout(t);
              timers.delete(m.id);
            });
          return next;
        });
      });
      // The server could not save a message.
      socket.on("message_error", () =>
        setMessages((prev) => {
          const last = [...prev].reverse().find((m) => m.pending);
          return last ? markFailed(prev, last.id) : prev;
        }),
      );
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      timers.forEach(clearTimeout);
      timers.clear();
      setConnected(false);
      setMessages([]);
    };
  }, [userId, enabled, loadHistory]);

  /** The open ticket's id, creating the ticket (once, even for concurrent sends) if there is none yet. */
  const ensureTicket = useCallback(
    async (firstMessage: string): Promise<string> => {
      if (ticketIdRef.current) return ticketIdRef.current;
      if (!creatingRef.current) {
        creatingRef.current = (async () => {
          const { data, error } = await publicDb()
            .from("support_tickets")
            .insert({ user_id: userId, subject: "Website Support Chat", description: firstMessage })
            .select("ticket_id")
            .single();
          if (error || !data) throw new Error(error?.message ?? "Could not open a support ticket");
          ticketIdRef.current = data.ticket_id as string;
          setTicketId(data.ticket_id as string);
          return data.ticket_id as string;
        })().finally(() => {
          creatingRef.current = null;
        });
      }
      return creatingRef.current;
    },
    [userId],
  );

  const fail = useCallback((localId: string) => {
    const t = timersRef.current.get(localId);
    if (t) clearTimeout(t);
    timersRef.current.delete(localId);
    setMessages((prev) => markFailed(prev, localId));
  }, []);

  const deliver = useCallback(
    async (localId: string, body: string) => {
      try {
        const socket = socketRef.current;
        if (!socket?.connected) throw new Error("Not connected");
        const id = await ensureTicket(body);
        socket.emit(SUPPORT_EVENTS.joinTicket, { ticket_id: id });
        socket.emit(SUPPORT_EVENTS.sendMessage, {
          ticket_id: id,
          sender_id: userId,
          sender_type: SUPPORT_SENDER_TYPE,
          body,
          is_internal_note: false,
        });
        timersRef.current.set(localId, setTimeout(() => fail(localId), SEND_TIMEOUT_MS));
      } catch (e) {
        console.warn("[support-chat] send failed:", e);
        fail(localId);
      }
    },
    [ensureTicket, fail, userId],
  );

  const send = useCallback(
    (text: string): boolean => {
      const body = text.trim();
      if (!body || !socketRef.current?.connected || !userId) return false;
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setMessages((prev) => addOptimistic(prev, body, localId));
      void deliver(localId, body);
      return true;
    },
    [userId, deliver],
  );

  const retry = useCallback(
    (localId: string) => {
      const failed = messages.find((m) => m.id === localId && m.failed);
      if (!failed) return;
      setMessages((prev) => markPending(prev, localId));
      void deliver(localId, failed.text);
    },
    [messages, deliver],
  );

  return { messages, connected, send, retry };
}
