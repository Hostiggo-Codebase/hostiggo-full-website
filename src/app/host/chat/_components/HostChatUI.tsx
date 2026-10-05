'use client';

import { SCHEMA } from "@/lib/schema.constants";
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Send, Search, ArrowLeft, Loader2, MessageSquare, MessagesSquare } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface ConversationUser {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: string;
  isFromMe: boolean;
}

export default function HostChatUI() {
  const { user, userId } = useAuth();

  const [conversations, setConversations] = useState<ConversationUser[]>([]);
  // Full API response (each conversation's complete message history), kept
  // separately from the sidebar-display-only `conversations` list above so
  // opening a thread doesn't need a second, unsupported fetch.
  const [rawChats, setRawChats] = useState<any[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // Mobile shows either the list or the open thread, not both.
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch(`/api/chat?userId=${encodeURIComponent(userId)}`);
      if (!response.ok) throw new Error('Failed to fetch conversations');

      const data = await response.json();
      const chats = data.data || [];
      setRawChats(chats);

      const formattedConversations: ConversationUser[] = chats.map((chat: any) => ({
        id: chat.participant_id,
        name: chat.participant_name || 'Guest',
        avatar: chat.participant_avatar || '',
        lastMessage: chat.last_message || 'No messages yet',
        lastMessageTime: chat.last_message_time ? formatTime(new Date(chat.last_message_time)) : 'Never',
        unreadCount: chat.unread_count || 0,
      }));

      setConversations(formattedConversations);

      setSelectedConversationId((current) =>
        current ?? (formattedConversations.length > 0 ? formattedConversations[0].id : null)
      );
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Fetch conversations (with full message history) on mount.
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Messages for the open thread, derived from the already-fetched
  // conversation history (the API has no per-conversation message endpoint).
  const messages: Message[] = useMemo(() => {
    const chat = rawChats.find((c) => c.participant_id === selectedConversationId);
    if (!chat) return [];
    return (chat.messages || []).map((msg: any) => ({
      id: msg.id,
      text: msg.text,
      senderId: msg.sender_id,
      senderName: msg.sender_name || 'Unknown',
      timestamp: formatTime(new Date(msg.timestamp)),
      isFromMe: msg.sender_id === userId,
    }));
  }, [rawChats, selectedConversationId, userId]);

  // Subscribe to real-time messages involving this host, then just refetch
  // -- the payload's column names already come back verified/consistent
  // via fetchChatHistory, so re-deriving state from one source avoids
  // duplicating that mapping logic here.
  useEffect(() => {
    if (!userId) return;

    // Realtime's `filter` only accepts a single `column=operator.value`
    // predicate -- it's the Realtime server's own grammar, not PostgREST,
    // and it doesn't understand `or(...)`. That used to be sent as one
    // filter string, which the server rejected, erroring the whole
    // subscription silently -- so new messages never pushed in live and
    // this screen only ever showed what was there on load. Two bindings on
    // the same channel (one per column) is the supported way to OR them.
    const channel = supabase
      .channel(`chat:host:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: SCHEMA.testingSchema,
          table: 'chat_messages',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: SCHEMA.testingSchema,
          table: 'chat_messages',
          filter: `host_id=eq.${userId}`,
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchConversations]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedConversationId || !userId || sending) return;

    setSending(true);
    const textToSend = messageText.trim();
    setMessageText('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: userId,
          recipientId: selectedConversationId,
          text: textToSend,
          senderType: 'host',
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to send message');
      }

      // Pull the new message (and updated preview) back from the source of
      // truth rather than hand-rolling an optimistic merge into rawChats.
      await fetchConversations();
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore text so the host doesn't lose what they typed.
      setMessageText(textToSend);
      toast.error(error instanceof Error ? error.message : 'Message not sent. Please try again.');
    } finally {
      setSending(false);
    }
  }, [messageText, selectedConversationId, userId, sending, fetchConversations]);

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);

  const filteredConversations = conversations.filter((conv) =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openConversation = (id: string) => {
    setSelectedConversationId(id);
    setMobileShowChat(true);
  };

  const inboxEmpty = !loading && conversations.length === 0;

  return (
    <div className="flex h-[calc(100dvh-220px)] min-h-[520px] gap-4">
      {/* Conversations sidebar -- on mobile, hidden while a thread is open */}
      <aside
        className={`${
          mobileShowChat ? 'hidden md:flex' : 'flex'
        } w-full md:w-80 shrink-0 flex-col bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden`}
      >
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-gray-900">Guest conversations</h3>
            {conversations.length > 0 && (
              <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                {conversations.length}
              </span>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search guests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:bg-white focus:border-figma-navy/40 focus:ring-2 focus:ring-figma-navy/10 text-sm transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                  <div className="w-11 h-11 rounded-full bg-gray-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/2 rounded bg-gray-100" />
                    <div className="h-3 w-3/4 rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-figma-navy/5 flex items-center justify-center mb-3">
                {searchQuery ? (
                  <Search className="w-5 h-5 text-figma-navy" />
                ) : (
                  <MessageSquare className="w-5 h-5 text-figma-navy" />
                )}
              </div>
              <p className="text-sm font-semibold text-gray-800">
                {searchQuery ? 'No matching guests' : 'No conversations yet'}
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-[220px]">
                {searchQuery
                  ? 'Try a different name.'
                  : 'When a guest messages you about a stay, the conversation will show up here.'}
              </p>
            </div>
          ) : (
            <ul className="p-2 space-y-1">
              {filteredConversations.map((conv) => {
                const active = selectedConversationId === conv.id;
                const unread = conv.unreadCount > 0;
                return (
                  <li key={conv.id}>
                    <button
                      onClick={() => openConversation(conv.id)}
                      className={`w-full text-left p-3 rounded-xl transition-colors flex items-center gap-3 ${
                        active ? 'bg-figma-navy/[0.07]' : 'hover:bg-gray-50'
                      }`}
                    >
                      <Avatar name={conv.name} src={conv.avatar} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`truncate text-sm ${
                              unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'
                            }`}
                          >
                            {conv.name}
                          </span>
                          <span className="text-[11px] text-gray-400 shrink-0">{conv.lastMessageTime}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p
                            className={`text-xs truncate ${
                              unread ? 'text-gray-800 font-medium' : 'text-gray-500'
                            }`}
                          >
                            {conv.lastMessage}
                          </p>
                          {unread && (
                            <span className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center bg-figma-navy text-white text-[11px] font-bold rounded-full shrink-0">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Chat area */}
      <section
        className={`${
          mobileShowChat ? 'flex' : 'hidden md:flex'
        } flex-1 min-w-0 flex-col bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden`}
      >
        {selectedConversation ? (
          <>
            <header className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
              <button
                onClick={() => setMobileShowChat(false)}
                className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-gray-100"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <Avatar name={selectedConversation.name} src={selectedConversation.avatar} />
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 truncate">{selectedConversation.name}</h3>
                <p className="text-xs text-gray-500">Guest</p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3 bg-[#f7f8fa]">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="w-8 h-8 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">
                    No messages yet. Say hello to {selectedConversation.name}.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] lg:max-w-md px-4 py-2.5 rounded-2xl shadow-sm ${
                        msg.isFromMe
                          ? 'bg-figma-navy text-white rounded-br-md'
                          : 'bg-white text-gray-900 border border-gray-100 rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
                      <p className={`text-[11px] mt-1 text-right ${msg.isFromMe ? 'text-white/70' : 'text-gray-400'}`}>
                        {msg.timestamp}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-100 bg-white flex items-end gap-2">
              <textarea
                rows={1}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter adds a new line.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e as unknown as React.FormEvent);
                  }
                }}
                placeholder={`Message ${selectedConversation.name}...`}
                disabled={sending}
                className="flex-1 resize-none max-h-32 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:bg-white focus:border-figma-navy/40 focus:ring-2 focus:ring-figma-navy/10 text-sm disabled:opacity-60 transition-all"
              />
              <button
                type="submit"
                disabled={sending || !messageText.trim()}
                aria-label="Send message"
                className="h-10 w-10 shrink-0 inline-flex items-center justify-center bg-figma-navy text-white rounded-full hover:bg-figma-navy/90 active:scale-95 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-figma-navy/5 flex items-center justify-center mb-4">
              <MessagesSquare className="w-7 h-7 text-figma-navy" />
            </div>
            <p className="text-lg font-bold text-gray-900">
              {inboxEmpty ? 'Your inbox is empty' : 'Select a conversation'}
            </p>
            <p className="text-sm text-gray-500 mt-1 max-w-sm">
              {inboxEmpty
                ? 'Guests can message you from your listing page or after booking. Replying quickly helps you win more bookings.'
                : 'Choose a guest on the left to read and reply to their messages.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

// Initials instead of a random stock face when a guest has no photo.
function Avatar({ name, src }: { name: string; src: string }) {
  const [failed, setFailed] = useState(false);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || 'G';
  if (!src || failed) {
    return (
      <span className="w-11 h-11 shrink-0 rounded-full bg-figma-navy/10 text-figma-navy font-bold text-sm inline-flex items-center justify-center">
        {initials}
      </span>
    );
  }
  return (
    <Image
      width={44}
      height={44}
      src={src}
      alt={name}
      className="w-11 h-11 shrink-0 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

// Helper function to format time
function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}
