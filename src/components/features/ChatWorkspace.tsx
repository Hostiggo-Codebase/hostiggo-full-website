'use client';

import { SCHEMA } from "@/lib/schema.constants";
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  CircleSlash,
  Flag,
  Headphones,
  Image as ImageIcon,
  MessageSquareText,
  MoreVertical,
  Pin,
  Search,
  Send,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

type ChatRole = 'guest' | 'host' | 'support';
type FilterKey = 'all' | 'primary' | 'support' | 'archived';

type Message = {
  id: string;
  body: string;
  time: string;
  from: 'me' | 'them';
};

type Conversation = {
  id: string;
  name: string;
  role: ChatRole;
  avatar: string;
  propertyImage?: string;
  propertyId?: string;
  preview: string;
  date: string;
  unread?: number;
  archived?: boolean;
  subtitle: string;
  messages: Message[];
};

// Local placeholders only: no stock photos standing in for real people or properties.
const DEFAULT_PROPERTY_IMAGES = ['/placeholder.svg'];

const DEFAULT_AVATARS = ['/placeholder.svg'];

// NOTE: There used to be hardcoded "sample" conversations here (fake hosts
// "Sarah Jenkins" / "Michael Chang" and a canned "Hostiggo Support" thread
// with invented message bodies). Showing those to a real user -- logged out,
// or logged in with genuinely zero conversations, which is the normal state
// for a new account -- would present fabricated messages as if a real host
// had actually contacted them. Real chat comes from `/api/chat`; when there
// is none, the UI should honestly show the empty state (see `EmptyList`)
// rather than invent content.

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'All',
  primary: 'Hosts',
  support: 'Support team',
  archived: 'Archived',
};

const MENU_ITEMS = [
  { label: 'Pin this chat', icon: Pin },
  { label: 'Mark as unread', icon: Bell },
  { label: 'Archive', icon: Archive },
  { label: 'Report', icon: Flag, separated: true },
];

function FilterDropdown({
  audience,
  filter,
  open,
  onOpenChange,
  onFilterChange,
}: {
  audience: ChatRole;
  filter: FilterKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilterChange: (filter: FilterKey) => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const primaryLabel = audience === 'host' ? 'Guests' : 'Hosts';
  const options: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'primary', label: primaryLabel },
    { key: 'support', label: 'Support team' },
    { key: 'archived', label: 'Archived' },
  ];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        onOpenChange(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [onOpenChange, open]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-blue-300 bg-[#E6F4FE] px-4 text-sm font-medium text-blue-500 transition-colors"
      >
        {filter === 'primary' ? primaryLabel : FILTER_LABELS[filter]}
        <ChevronDown className="h-3.5 w-3.5 text-blue-500" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-[172px] rounded-sm border border-gray-200 bg-white py-2 shadow-[0_7px_18px_rgba(0,0,0,0.18)]">
          {options.map((option) => (
            <button
              key={option.key}
              onClick={() => {
                onFilterChange(option.key);
                onOpenChange(false);
              }}
              className="flex w-full items-center justify-between px-5 py-2.5 text-left text-[13px] font-medium text-gray-700 hover:bg-gray-50"
            >
              {option.label}
              {option.key === filter && (
                <Check className="h-4 w-4 text-[#0074bd]" strokeWidth={2.5} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Composite Avatar Component
 * - For Hosts: Rounded rectangular property thumbnail base with overlapping circular user profile pic.
 * - For Support: Standard circular avatar with small headset icon overlay.
 */
function CompositeAvatar({
  conversation,
  size = 'sidebar',
}: {
  conversation: Conversation;
  size?: 'sidebar' | 'header';
}) {
  const isSupport = conversation.role === 'support';
  const fallbackPropertyImage = DEFAULT_PROPERTY_IMAGES[0];
  const propertyImg = conversation.propertyImage || fallbackPropertyImage;

  if (isSupport) {
    if (size === 'header') {
      return (
        <div className="relative flex-shrink-0">
          <Image
            width={48}
            height={48}
            src={conversation.avatar}
            alt={conversation.name}
            onError={(e) => {
              e.currentTarget.src = '/placeholder.svg';
            }}
            className="h-11 w-11 rounded-full object-cover shadow-xs"
          />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#0396EF] text-white border-2 border-white shadow-xs">
            <Headphones className="h-2.5 w-2.5" />
          </span>
        </div>
      );
    }

    return (
      <div className="relative flex-shrink-0">
        <Image
          width={40}
          height={40}
          src={conversation.avatar}
          alt={conversation.name}
          onError={(e) => {
            e.currentTarget.src = '/placeholder.svg';
          }}
          className="h-10 w-10 rounded-full object-cover shadow-xs"
        />
        <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#0396EF] text-white border-2 border-white shadow-xs">
          <Headphones className="h-2.5 w-2.5" />
        </span>
      </div>
    );
  }

  // Host composite avatar
  return (
    <div className="relative flex-shrink-0 w-14 h-10">
      <Image
        width={56}
        height={40}
        src={propertyImg}
        alt="Property thumbnail"
        onError={(e) => {
          e.currentTarget.src = fallbackPropertyImage;
        }}
        className="h-10 w-14 rounded-md object-cover shadow-xs"
      />
      <Image
        width={20}
        height={20}
        src={conversation.avatar}
        alt={conversation.name}
        onError={(e) => {
          e.currentTarget.src = '/placeholder.svg';
        }}
        className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white object-cover shadow-xs"
      />
    </div>
  );
}

function ConversationRow({
  conversation,
  selected,
  onClick,
}: {
  conversation: Conversation;
  selected: boolean;
  onClick: () => void;
}) {
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const isSentByMe = lastMessage ? lastMessage.from === 'me' : false;

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-all duration-150',
        selected
          ? 'bg-white shadow-md border border-gray-100'
          : 'hover:bg-gray-50/80 border border-transparent',
      )}
    >
      <CompositeAvatar conversation={conversation} size="sidebar" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-[13px] font-bold text-gray-900 leading-tight">
            {conversation.name}
          </span>
          <span className="shrink-0 text-[11px] text-gray-400 font-normal">
            {conversation.date}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="truncate text-[12px] text-gray-500 leading-snug">
            {isSentByMe && <span className="font-bold text-gray-700">Sent: </span>}
            {conversation.preview}
          </p>
          {Boolean(conversation.unread && conversation.unread > 0) && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0396EF] text-[10px] font-bold text-white shadow-xs">
              {conversation.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function EmptyList({ onClearFilters }: { onClearFilters?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <CircleSlash className="mb-5 h-9 w-9 text-gray-400" strokeWidth={1.8} />
      <p className="max-w-[220px] text-[13px] font-semibold leading-5 text-gray-500">
        You don&apos;t have any chat with selected filters
      </p>
      {onClearFilters && (
        <button
          onClick={onClearFilters}
          className="mt-4 rounded-full border border-figma-navy bg-white px-4 py-2 text-sm font-medium text-figma-navy transition-colors hover:bg-figma-navy/5"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function EmptyThread() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <MessageSquareText className="mb-5 h-12 w-12 text-gray-300" strokeWidth={1.6} />
      <p className="text-[15px] font-semibold text-gray-500">
        Open any chat to start messaging
      </p>
    </div>
  );
}

function ChatActionMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [onOpenChange, open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => onOpenChange(!open)}
        aria-label="Open chat actions"
        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-48 rounded-xl border border-gray-100 bg-white py-1.5 shadow-[0_10px_25px_rgba(0,0,0,0.12)]">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => onOpenChange(false)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors',
                  item.separated && 'mt-1 border-t border-gray-100 pt-2 text-red-600 hover:bg-red-50',
                )}
              >
                <Icon className={cn('h-4 w-4', item.separated ? 'text-red-500' : 'text-gray-500')} />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  avatar,
}: {
  message: Message;
  avatar: string;
}) {
  const mine = message.from === 'me';

  return (
    <div className={cn('flex items-end gap-2.5', mine ? 'justify-end' : 'justify-start')}>
      {!mine && (
        <Image
          width={32}
          height={32}
          src={avatar}
          alt=""
          onError={(e) => {
            e.currentTarget.src = '/placeholder.svg';
          }}
          className="mb-1 h-8 w-8 flex-shrink-0 rounded-full border border-white object-cover shadow-xs"
        />
      )}
      <div className={cn('max-w-[72%]', mine ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'px-4 py-2.5 text-[14px] leading-relaxed',
            mine
              ? 'rounded-2xl rounded-br-sm bg-[#0396EF] text-white shadow-xs'
              : 'rounded-2xl rounded-bl-sm bg-gray-100 text-gray-900',
          )}
        >
          {message.body}
        </div>
        <div
          className={cn(
            'mt-1 text-[11px] font-normal text-gray-400',
            mine ? 'text-right' : 'text-left',
          )}
        >
          {message.time}
        </div>
      </div>
    </div>
  );
}

function ConversationPanel({
  conversation,
  onBack,
  onMessageSent,
}: {
  conversation?: Conversation;
  onBack?: () => void;
  onMessageSent?: () => void;
}) {
  const { userId } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>(conversation?.messages ?? []);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Update messages when conversation changes
  useEffect(() => {
    setMessages(conversation?.messages ?? []);
  }, [conversation?.messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!conversation) {
    return (
      <section className="flex h-full min-w-0 flex-col items-center justify-center rounded-[2rem] border border-gray-200 bg-white p-6 shadow-xs">
        <EmptyThread />
      </section>
    );
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !userId) return;

    const messageText = draft.trim();

    // Optimistically add message to UI
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      body: messageText,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      from: 'me',
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setDraft('');
    setSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: userId,
          recipientId: conversation.id,
          text: messageText,
          senderType: 'user',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      const result = await response.json();
      if (result.data) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === optimisticMessage.id
              ? {
                  id: result.data.id,
                  body: result.data.text,
                  time: new Date(result.data.timestamp).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  from: 'me',
                }
              : msg,
          ),
        );
      }

      onMessageSent?.();
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMessage.id));
      // Give the text back so nothing typed is lost, and say why it failed
      // (e.g. contact details blocked by chat moderation).
      setDraft(messageText);
      toast.error(error instanceof Error ? error.message : 'Message not sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="relative flex h-full min-w-0 flex-col rounded-[2rem] border border-gray-200 bg-white p-6 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Back to chats"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <CompositeAvatar conversation={conversation} size="header" />
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-bold leading-tight text-gray-900">
              {conversation.name}
            </h2>
            <a
              href={conversation.role === 'support' ? '/support' : `/property/${conversation.propertyId || '1'}`}
              className="text-[12px] text-gray-600 underline font-medium hover:text-gray-900 transition-colors"
            >
              {conversation.role === 'support' ? 'Help Center' : 'Show listing'}
            </a>
          </div>
        </div>
        <ChatActionMenu open={menuOpen} onOpenChange={setMenuOpen} />
      </div>

      {/* Date divider */}
      <div className="my-4 flex items-center gap-3 px-16 text-[11px] font-medium text-gray-400">
        <span className="h-px flex-1 bg-gray-100" />
        Today
        <span className="h-px flex-1 bg-gray-100" />
      </div>

      {/* Messages */}
      <div className="reviews-scroll flex-1 space-y-4 overflow-y-auto pr-2">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            avatar={conversation.avatar}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <button
        aria-label="Jump to latest message"
        onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
        className="absolute bottom-[84px] right-8 flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-white shadow-md hover:bg-gray-800 transition-colors"
      >
        <ArrowDown className="h-4 w-4" />
      </button>

      {/* Message Input Area: Fully rounded pill shape with gray paper-airplane icon */}
      <form
        onSubmit={handleSendMessage}
        className="mt-3 relative flex items-center w-full rounded-full border border-gray-200 bg-white px-4 py-3 shadow-xs focus-within:border-[#0396EF] focus-within:ring-2 focus-within:ring-[#0396EF]/10 transition-all"
      >
        <button
          type="button"
          aria-label="Attach image"
          className="mr-2.5 hidden text-gray-400 hover:text-gray-600 sm:block transition-colors"
        >
          <ImageIcon className="h-4 w-4" />
        </button>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type here..."
          className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-gray-800 outline-none placeholder:text-gray-400"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!draft.trim() || sending}
          className={cn(
            'ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40 disabled:hover:text-gray-400',
            draft.trim() && 'text-[#0396EF] hover:text-[#0284d0]',
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}

export default function ChatWorkspace({
  audience,
  initialSelectedId,
  initialHostName,
}: {
  audience: 'guest' | 'host';
  initialSelectedId?: string;
  initialHostName?: string;
}) {
  const router = useRouter();
  const { userId } = useAuth();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  // Load conversations from API and subscribe to real-time updates
  useEffect(() => {
    const loadConversations = async () => {
      if (!userId) {
        // Not signed in -- nothing real to show, let the empty state render.
        setConversations([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/chat?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error('Failed to load conversations');
        const data = await response.json();

        let mappedConversations: Conversation[] = (data.data || []).map((chat: any, index: number) => ({
          id: chat.participant_id,
          name: chat.participant_name || 'Host',
          role: (chat.type === 'support' ? 'support' : 'host') as ChatRole,
          avatar: chat.participant_avatar || DEFAULT_AVATARS[index % DEFAULT_AVATARS.length],
          propertyImage: chat.property_image || DEFAULT_PROPERTY_IMAGES[index % DEFAULT_PROPERTY_IMAGES.length],
          propertyId: String(index + 1),
          preview: chat.last_message || 'No messages yet',
          date: chat.last_message_time ? 'Today' : 'Never',
          subtitle: 'Property host',
          messages: (chat.messages || []).map((msg: any) => ({
            id: msg.id,
            body: msg.text,
            time: new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            from: msg.sender_id === userId ? 'me' : 'them',
          })),
        }));

        // If an initialSelectedId was specified and not found, prepend it
        if (initialSelectedId && !mappedConversations.find((c) => c.id === initialSelectedId)) {
          const newConversation: Conversation = {
            id: initialSelectedId,
            name: initialHostName && initialHostName !== 'Host' ? initialHostName : 'Property host',
            role: 'host',
            avatar: DEFAULT_AVATARS[0],
            propertyImage: DEFAULT_PROPERTY_IMAGES[0],
            propertyId: '1',
            preview: 'No messages yet',
            date: 'Now',
            subtitle: initialHostName && initialHostName !== 'Host' ? initialHostName : 'Property host',
            messages: [],
          };
          mappedConversations.unshift(newConversation);
        }

        setConversations(mappedConversations);
      } catch (error) {
        console.error('Failed to load conversations:', error);
        setConversations([]);
      } finally {
        setLoading(false);
      }
    };

    loadConversations();

    // Realtime changes listener
    const handleNewMessage = (payload: any) => {
      const newMsg = payload.new;
      const participantId = newMsg.user_id === userId ? newMsg.host_id : newMsg.user_id;

      setConversations((prev) => {
        const updated = [...prev];
        const convIndex = updated.findIndex((c) => c.id === participantId);

        if (convIndex >= 0) {
          const senderIsCurrentUser =
            newMsg.sender_type === 'user' ? newMsg.user_id === userId : newMsg.host_id === userId;
          updated[convIndex].messages.push({
            id: newMsg.id,
            body: newMsg.content,
            time: new Date(newMsg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            from: senderIsCurrentUser ? 'me' : 'them',
          });
          updated[convIndex].preview = newMsg.content;
          updated[convIndex].date = 'Now';

          const [conversation] = updated.splice(convIndex, 1);
          updated.unshift(conversation);
        } else {
          const senderIsCurrentUser =
            newMsg.sender_type === 'user' ? newMsg.user_id === userId : newMsg.host_id === userId;
          const newConversation: Conversation = {
            id: participantId,
            name: 'New conversation',
            role: 'host',
            avatar: DEFAULT_AVATARS[0],
            propertyImage: DEFAULT_PROPERTY_IMAGES[0],
            propertyId: '1',
            preview: newMsg.content,
            date: 'Now',
            subtitle: 'Property host',
            messages: [
              {
                id: newMsg.id,
                body: newMsg.content,
                time: new Date(newMsg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                from: senderIsCurrentUser ? 'me' : 'them',
              },
            ],
          };
          updated.unshift(newConversation);
        }

        return updated;
      });
    };

    const channel = supabase
      .channel(`chat:user:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: SCHEMA.testingSchema,
          table: 'chat_messages',
          filter: `user_id=eq.${userId}`,
        },
        handleNewMessage,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: SCHEMA.testingSchema,
          table: 'chat_messages',
          filter: `host_id=eq.${userId}`,
        },
        handleNewMessage,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, initialSelectedId, initialHostName]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return conversations.filter((conversation) => {
      if (filter === 'primary') {
        const expectedRole = audience === 'host' ? 'guest' : 'host';
        if (conversation.role !== expectedRole || conversation.archived) return false;
      }
      if (filter === 'support' && conversation.role !== 'support') return false;
      if (filter === 'archived' && !conversation.archived) return false;
      if (filter === 'all' && conversation.archived) return false;
      if (unreadOnly && !conversation.unread) return false;

      if (!normalizedQuery) return true;
      return [conversation.name, conversation.preview, conversation.subtitle]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [audience, conversations, filter, query, unreadOnly]);

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedId,
  );
  const primaryHeading = audience === 'host' ? 'Guests' : 'Hosts';
  const supportItems = filtered.filter((item) => item.role === 'support');
  const primaryItems = filtered.filter((item) => item.role !== 'support');
  const hasFilters = filter !== 'all' || unreadOnly || query.trim().length > 0;

  const handleClearFilters = useCallback(() => {
    setFilter('all');
    setUnreadOnly(false);
    setQuery('');
  }, []);

  return (
    <div className="min-h-screen bg-[#fffdf8] text-gray-900">
      <main className="mx-auto flex max-w-[1520px] gap-6 px-4 pb-8 pt-8 sm:px-8 lg:gap-8">
        <button
          onClick={() => router.push('/')}
          aria-label="Go to home"
          className="mt-5 hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#004772] shadow-[0_8px_20px_rgba(15,23,42,0.18)] transition-transform hover:-translate-x-0.5 md:flex"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="grid min-w-0 flex-1 grid-cols-1 gap-5 md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
          {/* Sidebar */}
          <aside
            className={cn(
              'h-[70dvh] min-w-0 flex-col rounded-[2rem] border border-gray-200 bg-white px-6 py-6 shadow-xs transition-colors md:flex md:h-[calc(100dvh-220px)] md:min-h-[520px]',
              selectedId ? 'hidden' : 'flex',
            )}
          >
            <h1 className="text-[30px] font-semibold tracking-tight text-gray-950">Chats</h1>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <FilterDropdown
                audience={audience === 'host' ? 'host' : 'guest'}
                filter={filter}
                open={filterOpen}
                onOpenChange={setFilterOpen}
                onFilterChange={setFilter}
              />
              <button
                onClick={() => setUnreadOnly((value) => !value)}
                className={cn(
                  'h-8 rounded-full border border-blue-300 px-4 text-sm font-medium transition-colors text-blue-500',
                  unreadOnly
                    ? 'bg-[#E6F4FE]'
                    : 'bg-white hover:bg-blue-50/40',
                )}
              >
                Unread
              </button>
            </div>

            {/* Sidebar Categorization: Hosts and Support Team */}
            <div className="reviews-scroll mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
              {loading ? (
                <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                  <div className="w-7 h-7 border-2 border-[#0396EF]/40 border-t-[#0396EF] rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-[12px] text-gray-500 font-medium">
                    Loading conversations…
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <EmptyList onClearFilters={handleClearFilters} />
              ) : (
                <div className="space-y-4">
                  {primaryItems.length > 0 && (
                    <section>
                      <h3 className="text-[15px] font-semibold text-gray-800 mb-3 mt-4">
                        {filter === 'archived' ? 'Archived' : primaryHeading}
                      </h3>
                      <div className="space-y-1.5">
                        {primaryItems.map((conversation) => (
                          <ConversationRow
                            key={conversation.id}
                            conversation={conversation}
                            selected={conversation.id === selectedId}
                            onClick={() => setSelectedId(conversation.id)}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {supportItems.length > 0 && (
                    <section>
                      <h3 className="text-[15px] font-semibold text-gray-800 mb-3 mt-4">
                        Support Team
                      </h3>
                      <div className="space-y-1.5">
                        {supportItems.map((conversation) => (
                          <ConversationRow
                            key={conversation.id}
                            conversation={conversation}
                            selected={conversation.id === selectedId}
                            onClick={() => setSelectedId(conversation.id)}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>

            {hasFilters && filtered.length > 0 && (
              <button
                onClick={handleClearFilters}
                className="mx-auto mt-3 h-7 rounded-md border border-[#004772] px-4 text-[11px] font-semibold text-[#004772] hover:bg-figma-navy/5"
              >
                Clear filters
              </button>
            )}
          </aside>

          {/* Right Column: Search & Chat Thread Container */}
          <div
            className={cn(
              'min-w-0 flex-col h-[70dvh] md:h-[calc(100dvh-220px)] md:min-h-[520px]',
              selectedId ? 'flex' : 'hidden md:flex',
            )}
          >
            {/* Top Search Bar & Settings Icon */}
            <div className="mb-4 flex items-center justify-start gap-3 flex-shrink-0">
              <label className="flex h-10 w-full max-w-sm items-center gap-2.5 rounded-full border border-gray-300 bg-white px-4 shadow-xs">
                <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                  className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-gray-700 outline-none placeholder:text-gray-400"
                />
              </label>
              <button
                aria-label="Chat settings"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 shadow-xs"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>

            {/* Chat Area / Thread Container */}
            <div className="flex-1 min-h-0 min-w-0">
              <ConversationPanel
                conversation={selectedConversation}
                onBack={() => setSelectedId(null)}
                onMessageSent={() => {
                  // Conversation will be updated automatically by the real-time subscription
                }}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
