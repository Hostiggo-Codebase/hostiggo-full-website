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
  ticketIdForUser,
  type SupportMessage,
  type SupportPayload,
} from "@/lib/supportChat";

/** Live support chat over the admin portal's Socket.IO server. Reconnects by itself. */
export function useSupportChat(userId: string | null | undefined, enabled = true) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!userId || !enabled) return;
    let cancelled = false;
    const ticketId = ticketIdForUser(userId);

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
        socket.emit(SUPPORT_EVENTS.joinTicket, { ticket_id: ticketId }); // re-joins after every reconnect
      });
      socket.on("disconnect", () => setConnected(false));
      socket.on("connect_error", () => setConnected(false));
      socket.on(SUPPORT_EVENTS.newMessage, (payload: SupportPayload) =>
        setMessages((prev) => applyIncoming(prev, payload, userId)),
      );
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      setMessages([]);
    };
  }, [userId, enabled]);

  const send = useCallback(
    (text: string): boolean => {
      const body = text.trim();
      const socket = socketRef.current;
      if (!body || !socket?.connected || !userId) return false;
      setMessages((prev) => addOptimistic(prev, body, `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`));
      socket.emit(SUPPORT_EVENTS.sendMessage, {
        ticket_id: ticketIdForUser(userId),
        sender_id: userId,
        sender_type: SUPPORT_SENDER_TYPE,
        body,
        is_internal_note: false,
      });
      return true;
    },
    [userId],
  );

  return { messages, connected, send };
}
