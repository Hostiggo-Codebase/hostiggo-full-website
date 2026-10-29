'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserAvatar } from '@/components/ui/user-avatar';
import Image from 'next/image';
import {
  CalendarCheck,
  Building2,
  Wallet,
  Star,
  Settings,
  ArrowLeftRight,
  LifeBuoy,
  LogOut,
  Bell,
  HelpCircle,
  Plus,
  CalendarDays,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import KycStatusBanner from '@/components/features/KycStatusBanner';

import { MessageCircle } from 'lucide-react';

type NavKey =
  | 'bookings'
  | 'listings'
  | 'calendar'
  | 'earnings'
  | 'reviews'
  | 'chat'
  | 'settings';

const NAV: { key: NavKey; label: string; href: string; icon: LucideIcon }[] = [
  { key: 'listings', label: 'Properties', href: '/host/listings', icon: Building2 },
  { key: 'bookings', label: 'Reservations', href: '/host/bookings', icon: CalendarCheck },
  { key: 'calendar', label: 'Calendar', href: '/host/calendar', icon: CalendarDays },
  { key: 'chat', label: 'Messages', href: '/host/chat', icon: MessageCircle },
  { key: 'earnings', label: 'Earnings', href: '/host/earnings', icon: Wallet },
  { key: 'reviews', label: 'Reviews', href: '/host/reviews', icon: Star },
  { key: 'settings', label: 'Settings', href: '/host/settings', icon: Settings },
];

function SidebarContent({
  active,
  onLogout,
  onNavigate,
}: {
  active: NavKey;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="mb-6 lg:mb-10 px-2 pr-12 lg:pr-2">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Hostiggo Logo"
            width={32}
            height={32}
          />
          <span className="text-lg font-extrabold text-gray-900">
            HOSTI<span className="text-figma-navy">GGO</span>
          </span>
        </Link>
        <div className="ml-11">
          <p className="text-sm text-gray-500 mt-1">Host Dashboard</p>
        </div>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const Icon = item.icon;
          const on = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-medium',
                on ? 'bg-figma-navy text-white font-semibold' : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="pt-6 border-t border-gray-200 space-y-1">
        <Link
          href="/"
          onClick={onNavigate}
          className="w-full flex items-center gap-3 px-4 py-3 text-figma-navy border border-figma-navy/30 rounded-xl mb-3 hover:bg-figma-navy/5 transition-all text-sm font-medium"
        >
          <ArrowLeftRight className="w-5 h-5" />
          Switch to Guest
        </Link>
        <Link
          href="/support"
          onClick={onNavigate}
          className="flex items-center gap-3 px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-all text-sm"
        >
          <LifeBuoy className="w-5 h-5" />
          Support
        </Link>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-all text-sm"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>
    </>
  );
}

export default function HostDashboardShell({
  active,
  children,
}: {
  active: NavKey;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const handleLogout = () => signOut();
  // Must match the placeholder used across host/settings and the
  // host profile API so an unset photo looks the same everywhere.

  return (
    <div className="host-dashboard min-h-screen overflow-x-clip bg-[#f0f2f5] text-gray-800 lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col h-screen fixed left-0 top-0 py-8 px-4 border-r border-gray-200 bg-white w-64 z-40">
        <SidebarContent active={active} onLogout={handleLogout} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85%] bg-white flex flex-col py-6 px-4 shadow-2xl overflow-y-auto overscroll-contain">
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute top-3 right-3 p-2.5 text-gray-500 hover:bg-gray-100 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent
              active={active}
              onLogout={handleLogout}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-30 flex justify-between items-center px-3 sm:px-4 md:px-10 h-16 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="flex items-center gap-2 lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="p-2.5 -ml-1 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Hostiggo Logo"
              width={24}
              height={24}
            />
            <span className="text-base sm:text-lg font-extrabold text-gray-900">
              HOSTI<span className="text-figma-navy">GGO</span>
            </span>
          </Link>
        </div>
        <div className="hidden lg:block" />
        <div className="flex items-center gap-1 sm:gap-2 md:gap-3 shrink-0">
          <Link
            href="/host/list/method"
            className="flex items-center gap-2 bg-figma-navy text-white px-3 sm:px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-figma-navy/90 transition-all active:scale-[0.99]" aria-label="Create listing"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Create Listing</span>
          </Link>
          <Link
            href="/notifications"
            aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
            className="relative p-2.5 text-gray-500 hover:bg-gray-100 rounded-full transition-all"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-[18px] text-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          <button
            aria-label="Help"
            className="hidden sm:inline-flex p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-all"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <Link
            href="/host/account"
            aria-label="Host account"
            className="w-8 h-8 rounded-full overflow-hidden ml-1 border border-gray-200"
          >
            <UserAvatar src={user?.profile_pic_url} name={user?.name || 'Host'} size={32} className="h-full w-full" />
          </Link>
        </div>
      </header>

      <main className="px-4 sm:px-6 md:px-10 py-5 sm:py-8 max-w-7xl mx-auto min-w-0">
        <KycStatusBanner />
        {children}
      </main>
    </div>
  );
}

// Page heading used across dashboard pages.
export function DashboardHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6 mb-6 md:mb-8">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm sm:text-base text-gray-500 mt-1.5 sm:mt-2 max-w-2xl">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-3 [&>*]:max-sm:flex-1 [&>*]:max-sm:justify-center">{actions}</div>}
    </section>
  );
}
