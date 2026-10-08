"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSupportChat } from "@/hooks/useSupportChat";
import { cn } from "@/lib/utils";

export default function SupportLiveChat() {
  const { userId } = useAuth();
  const { messages, connected, send } = useSupportChat(userId);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
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
          {connected ? "Connected" : "Connecting…"}
        </span>
      </header>

      <div className="h-72 space-y-3 overflow-y-auto bg-gray-50 px-5 py-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="pt-16 text-center text-sm text-gray-400">
            {connected ? "Say hello. Describe your issue and we will help." : "Connecting you to support…"}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.fromUser ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                m.fromUser ? "bg-figma-navy text-white" : "border border-gray-200 bg-white text-gray-800",
                m.pending && "opacity-60",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              {!m.fromUser && <p className="mt-1 text-[10px] text-gray-400">Hostiggo Support</p>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
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
          placeholder={connected ? "Type your message" : "Waiting for connection…"}
          disabled={!connected}
          maxLength={2000}
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-figma-navy disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={!connected || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-figma-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" /> Send
        </button>
      </form>
    </section>
  );
}
