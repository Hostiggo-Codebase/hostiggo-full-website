"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSupportChat } from "@/hooks/useSupportChat";
import { cn } from "@/lib/utils";

// Same starters as the mobile app's support chat.
const STARTERS = [
  "Hi! 👋",
  "I need help with a booking.",
  "I have a payment or refund question.",
  "I want to report a problem with a property.",
];

const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (Date.now() - d.getTime() < 24 * 60 * 60 * 1000) return time;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
};

export default function SupportLiveChat() {
  const { userId } = useAuth();
  const { messages, connected, send, retry } = useSupportChat(userId);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Like the app: keep the newest message in view on open, send and receive. Only the message list scrolls --
  // scrollIntoView would also scroll the whole page down to the chat.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  if (!userId) {
    return (
      <section className="mb-12 rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <h2 className="text-lg font-bold text-gray-900">Live chat with Hostiggo Support</h2>
        <p className="mt-1 text-sm text-gray-500">Sign in to chat with our support team.</p>
      </section>
    );
  }

  const submit = () => {
    if (send(text)) setText("");
  };

  return (
    <section className="mb-12 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
      <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Live chat with Hostiggo Support</h2>
          <p className="text-xs text-gray-500">Our team replies here as soon as they can.</p>
        </div>
        <span className={cn("flex items-center gap-2 text-xs font-medium", connected ? "text-green-600" : "text-amber-600")}>
          {connected ? <span className="h-2 w-2 rounded-full bg-green-500" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {connected ? "Connected" : "Reconnecting…"}
        </span>
      </header>

      <div ref={listRef} className="h-72 space-y-3 overflow-y-auto bg-gray-50 px-5 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-4">
            <p className="text-sm text-gray-500">Start the conversation</p>
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => send(starter)}
                className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-700 hover:border-figma-navy"
              >
                {starter}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex flex-col", m.fromUser ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                m.fromUser ? "bg-figma-navy text-white" : "border border-gray-200 bg-white text-gray-800",
                m.pending && "opacity-60",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              {!m.fromUser && <p className="mt-1 text-[10px] text-gray-400">— Hostiggo Support</p>}
            </div>
            <span className="mt-1 text-[10px] text-gray-400">{formatTime(m.at)}</span>
            {m.fromUser && m.pending && <span className="text-[10px] text-gray-400">Sending…</span>}
            {m.failed && (
              <button type="button" onClick={() => retry(m.id)} className="text-[11px] font-semibold text-red-600 underline">
                Failed — tap to retry
              </button>
            )}
          </div>
        ))}
      </div>

      <form
        className="flex items-center gap-2 border-t border-gray-100 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message"
          maxLength={4000}
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-figma-navy"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-figma-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" /> Send
        </button>
      </form>
    </section>
  );
}
