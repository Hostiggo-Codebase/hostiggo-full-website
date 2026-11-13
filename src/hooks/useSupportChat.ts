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
const TICKET_REFRESH_MS = 30_000;

export interface SupportTicket {
  ticket_id: string;
  ticket_number: string | null;
  subject: string | null;
  description: string | null;
  status: string;
  created_at: string;
}

// Support tables live in the `public` schema; the site client defaults to the app schema.
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
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const ticketsRef = useRef<SupportTicket[]>([]);
  // True once the customer chose "New ticket": stops the list refresh from jumping back to an old ticket.
  const draftRef = useRef(false);
  const createdRef = useRef<Set<string>>(new Set());
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

  /** Makes `id` the open conversation (undefined = a blank draft; the next message raises a new ticket). */
  const switchTo = useCallback((id: string | undefined) => {
    if (ticketIdRef.current === id) return;
    ticketIdRef.current = id;
    setTicketId(id);
    setMessages([]);
    if (id) setUnread((u) => (u[id] ? { ...u, [id]: 0 } : u));
  }, []);

  // Every open ticket the customer has (not just the newest), so none is hidden from them.
  const refreshTickets = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await publicDb()
      .from("support_tickets")
      .select("ticket_id, ticket_number, subject, description, status, created_at")
      .eq("user_id", userId)
      .not("status", "in", "(CLOSED,RESOLVED)")
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[support-chat] ticket lookup failed:", error.message);
      return;
    }
    const list = (data ?? []) as SupportTicket[];
    ticketsRef.current = list;
    setTickets(list);
    const current = ticketIdRef.current;
    list.forEach((t) => createdRef.current.delete(t.ticket_id));
    // The open ticket was closed or resolved by an agent: move on to the newest one that is still open.
    // (A ticket created a moment ago may be missing from a lookup that started before it existed.)
    if (current && !list.some((t) => t.ticket_id === current) && !createdRef.current.has(current)) {
      switchTo(list[0]?.ticket_id);
    } else if (!current && !draftRef.current && list.length) {
      switchTo(list[0].ticket_id);
    }
  }, [userId, switchTo]);

  useEffect(() => {
    if (!userId || !enabled) return;
    void refreshTickets();
    // Agents close tickets from the admin portal; poll so closed ones drop off the list.
    const interval = setInterval(() => void refreshTickets(), TICKET_REFRESH_MS);
    return () => clearInterval(interval);
  }, [userId, enabled, refreshTickets]);

  // Listen on every open ticket's room, so a reply on a ticket that isn't on screen still shows as unread.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    tickets.forEach((t) => socket.emit(SUPPORT_EVENTS.joinTicket, { ticket_id: t.ticket_id }));
  }, [tickets]);

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
        ticketsRef.current.forEach((t) => socket.emit(SUPPORT_EVENTS.joinTicket, { ticket_id: t.ticket_id }));
        if (id) {
          socket.emit(SUPPORT_EVENTS.joinTicket, { ticket_id: id });
          void loadHistory(id);
        }
        void refreshTickets();
      });
      socket.on("disconnect", () => setConnected(false));
      socket.on("connect_error", () => setConnected(false));
      socket.on(SUPPORT_EVENTS.newMessage, (payload: SupportPayload) => {
        if (payload.ticket_id !== ticketIdRef.current) {
          // A reply on another open ticket: flag it so the customer notices.
          const other = payload.ticket_id;
          if (other && payload.sender_type !== "user" && !payload.is_internal_note && payload.body?.trim()) {
            setUnread((u) => ({ ...u, [other]: (u[other] ?? 0) + 1 }));
          }
          return;
        }
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
  }, [userId, enabled, loadHistory, refreshTickets]);

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
          draftRef.current = false;
          createdRef.current.add(data.ticket_id as string);
          ticketIdRef.current = data.ticket_id as string;
          setTicketId(data.ticket_id as string);
          // Show the new ticket in the list straight away.
          void refreshTickets();
          return data.ticket_id as string;
        })().finally(() => {
          creatingRef.current = null;
        });
      }
      return creatingRef.current;
    },
    [userId, refreshTickets],
  );

  const fail =useCallback((localId: string) => {
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
      // Like the app: sending while disconnected adds the message as failed (with a retry) instead of dropping it.
      if (!body || !userId) return false;
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

  const selectTicket = useCallback(
    (id: string) => {
      draftRef.current = false;
      switchTo(id);
    },
    [switchTo],
  );

  /** Starts a blank conversation; the first message sent in it raises a new ticket. */
  const newTicket = useCallback(() => {
    draftRef.current = true;
    switchTo(undefined);
  }, [switchTo]);

  return { messages, connected, send, retry, tickets, activeTicketId: ticketId, unread, selectTicket, newTicket };
}
