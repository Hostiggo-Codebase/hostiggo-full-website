"use client";

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { cn } from '@/lib/utils';
import ProfileCompletionBanner from '@/components/features/ProfileCompletionBanner';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  Check,
  Clock,
  Globe,
  Heart,
  HelpCircle,
  Home,
  Inbox,
  IndianRupee,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  Star,
  User,
  X,
} from "lucide-react";


interface MenuItem {
  icon: React.ReactNode;
  label: string;
  to?: string;
  danger?: boolean;
  action?: () => void;
  // Placeholder for a feature that isn't built yet, rendered disabled with a
  // "Soon" pill so the slot stays in the menu without being a dead link.
  soon?: boolean;
}

const MENU_GROUPS: MenuItem[][] = [
  [
    {
      icon: <MessageCircle className="w-4 h-4" />,
      label: "Chats",
      to: "/chat",
    },
    {
      icon: <Inbox className="w-4 h-4" />,
      label: "Inbox",
      to: "/notifications",
    },
    {
      icon: <Heart className="w-4 h-4" />,
      label: "Wishlists",
      to: "/wishlist",
    },
    {
      icon: <Clock className="w-4 h-4" />,
      label: "Memories",
      to: "/my-memories",
    },
    {
      icon: <User className="w-4 h-4" />,
      label: "Profile",
      to: "/account/profile",
    },
  ],
  [
    {
      icon: <Settings className="w-4 h-4" />,
      label: "Account Settings",
      to: "/account/settings",
    },
    {
      icon: <Home className="w-4 h-4" />,
      label: "Hosting",
      to: "/host/listings",
    },
    {
      icon: <HelpCircle className="w-4 h-4" />,
      label: "Customer support",
      to: "/support",
    },
  ],
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, signOut } = useAuth();
  const { unreadCount } = useNotifications();

  const isDevBypass =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true';

  const handleSignOut = () => {
    setProfileOpen(false);
    setMobileOpen(false);
    signOut();
  };

  // Close profile dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <>
    <nav className="bg-white sticky top-0 z-50 border-b border-[#EFEFEF] flex-shrink-0 transition-all">
      <div className="w-full px-4 sm:px-6 lg:px-10">
        <div className="flex items-center justify-between h-16 md:h-[105px]">
          {/* Logo matching Figma Component 271 */}
          <Link
            href="/"
            className="flex items-center gap-3 flex-shrink-0 group"
          >
            <div className="w-11 h-11 rounded-full bg-[#004772] flex items-center justify-center flex-shrink-0 shadow-xs transition-transform group-hover:scale-105">
              <span className="text-white text-[22px] font-bold font-['Poppins'] leading-none">
                H
              </span>
            </div>
            <div className="flex items-baseline tracking-tight">
              <span
                className="font-bold text-[#004772] text-[22px] md:text-[24px] uppercase"
                style={{ fontFamily: "Poppins, sans-serif" }}
              >
                Hostig
              </span>
              <span
                className="font-bold text-[#0086D8] text-[22px] md:text-[24px] uppercase"
                style={{ fontFamily: "Poppins, sans-serif" }}
              >
                go
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center">
            
            <div className="flex items-center gap-1.5 text-[#004772] text-[15px] font-semibold font-['Poppins'] cursor-pointer hover:opacity-80 transition-opacity">
              <IndianRupee className="w-[18px] h-[18px]" />
              <span>INR.</span>
            </div>

            <div className="w-[1px] h-4 bg-[#004772]/20 mx-4"></div>

            <div className="flex items-center gap-1.5 text-[#004772] text-[15px] font-semibold font-['Poppins'] cursor-pointer hover:opacity-80 transition-opacity">
              <Globe className="w-[18px] h-[18px] stroke-2" />
              <span>English</span>
            </div>

            <div className="w-[1px] h-4 bg-[#004772]/20 mx-4"></div>

            {(!isAuthenticated || isDevBypass) && (
              <button
                type="button"
                onClick={() => router.push("/signin")}
                className="text-[#004772] text-[15px] font-semibold font-['Poppins'] hover:underline cursor-pointer"
              >
                Sign In
              </button>
            )}

            <button
              type="button"
              className="border border-[#004772] text-[#004772] hover:bg-[#004772]/5 px-6 py-2 rounded-xl text-[14px] font-semibold transition-colors font-['Poppins'] cursor-pointer ml-6"
              onClick={() => router.push("/host/list/method")}
            >
              List your property
            </button>

            {isAuthenticated ? (
              <div ref={profileRef} className="relative ml-6">
                <button
                  type="button"
                  aria-label="Account menu"
                  aria-expanded={profileOpen}
                  onClick={() => setProfileOpen((v) => !v)}
                  className="w-11 h-11 rounded-full overflow-hidden border-2 border-gray-200 hover:border-[#004772] transition-all cursor-pointer shadow-xs"
                >
                  <UserAvatar src={user?.profile_pic_url} name={user?.name || 'Account'} size={40} className="h-full w-full" />
                </button>

                {profileOpen && (
                  <div
                    className={cn(
                      "absolute right-0 top-[calc(100%+8px)] w-[260px] h-auto max-h-[80vh] overflow-y-auto bg-white rounded-[6px] p-[9px] shadow-[0_4px_21.7px_6px_rgba(0,0,0,0.25)] border border-gray-100 z-50 flex flex-col",
                      "animate-fade-in-down origin-top-right",
                    )}
                    style={{ animation: "fadeInDown 0.18s ease both" }}
                  >
                    <div className="flex flex-col">
                      {MENU_GROUPS.map((group, gi) => (
                        <div key={gi}>
                          <div className="py-0.5">
                            {group.map((item) =>
                              item.soon ? (
                                <div
                                  key={item.label}
                                  className="flex items-center gap-2.5 px-2.5 py-1.5 text-[14px] font-medium text-gray-400 cursor-default select-none"
                                >
                                  <span className="text-gray-300">{item.icon}</span>
                                  <span>{item.label}</span>
                                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">Soon</span>
                                </div>
                              ) : (
                                <Link
                                  key={item.label}
                                  href={item.to ?? "#"}
                                  onClick={() => {
                                    item.action?.();
                                    setProfileOpen(false);
                                  }}
                                  className="flex items-center gap-2.5 px-2.5 py-1.5 text-[14px] font-medium text-gray-700 hover:bg-gray-50 rounded transition-colors"
                                >
                                  <span className="text-gray-400">{item.icon}</span>
                                  <span>{item.label}</span>
                                </Link>
                              )
                            )}
                          </div>
                          <div className="border-b border-dotted border-gray-300 my-1" />
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full py-2 border border-red-500 text-red-500 font-medium rounded-md hover:bg-red-50 text-center flex justify-center transition-colors text-[14px]"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="ml-6 w-11 h-11 rounded-full overflow-hidden border-2 border-gray-200">
                <UserAvatar src={undefined} name="Guest" size={40} className="h-full w-full opacity-50" />
              </div>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 py-3 space-y-1 pb-4">
            {isAuthenticated ? (
              <>
                <Link
                  href="/chat"
                  onClick={() => setMobileOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2.5 font-medium"
                >
                  <MessageCircle className="w-4 h-4 text-gray-500" /> Chats
                </Link>
                <Link
                  href="/notifications"
                  onClick={() => setMobileOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2.5 font-medium"
                >
                  <Inbox className="w-4 h-4 text-gray-500" /> Inbox
                </Link>
                <Link
                  href="/wishlist"
                  onClick={() => setMobileOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2.5 font-medium"
                >
                  <Heart className="w-4 h-4 text-gray-500" /> Wishlists
                </Link>
                <Link
                  href="/my-memories"
                  onClick={() => setMobileOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2.5 font-medium"
                >
                  <Clock className="w-4 h-4 text-gray-500" /> Memories
                </Link>
                <Link
                  href="/account/profile"
                  onClick={() => setMobileOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2.5 font-medium"
                >
                  <User className="w-4 h-4 text-gray-500" /> Profile
                </Link>
                <Link
                  href="/account/settings"
                  onClick={() => setMobileOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2.5 font-medium"
                >
                  <Settings className="w-4 h-4 text-gray-500" /> Account settings
                </Link>
                <Link
                  href="/support"
                  onClick={() => setMobileOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2.5 font-medium"
                >
                  <HelpCircle className="w-4 h-4 text-gray-500" /> Customer support
                </Link>
                <Link
                  href="/host/listings"
                  onClick={() => setMobileOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2.5 font-medium"
                >
                  <Home className="w-4 h-4 text-amber-500" /> Host &amp; Earn
                </Link>
                <div className="px-4 pt-2">
                  <button
                    onClick={handleSignOut}
                    className="w-full border border-red-200 text-red-500 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-red-50"
                  >
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="px-4 pt-2 flex gap-2">
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      router.push("/signin");
                    }}
                    className="flex-1 bg-figma-navy text-white py-2 rounded-xl text-sm font-semibold"
                  >
                    Sign in or sign up
                  </button>
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      router.push("/host/list/method");
                    }}
                    className="flex-1 border border-figma-navy text-figma-navy py-2 rounded-xl text-sm font-semibold"
                  >
                    List your property
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
    {!pathname.startsWith('/account/profile') && <ProfileCompletionBanner />}
    </>
  );
}
