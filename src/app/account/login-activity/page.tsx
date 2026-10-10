"use client";

import { useEffect, useState } from "react";
import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { ArrowLeft, Laptop, Loader2, Smartphone } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

type LoginEvent = {
  id: number;
  method: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

const METHOD_LABELS: Record<string, string> = {
  email_otp: "Email code",
  phone_otp: "Mobile code",
  password: "Password",
  google: "Google",
};

// Rough, dependency-free UA parse -- good enough to show "Chrome on macOS"
// rather than a raw user-agent string. Not meant to be exhaustive.
function parseUserAgent(ua: string | null): { device: string; isMobile: boolean } {
  if (!ua) return { device: "Unknown device", isMobile: false };
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);

  let browser = "a browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  let os = "an unknown OS";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  return { device: `${browser} on ${os}`, isMobile };
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function LoginActivityPage() {
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<LoginEvent[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    api
      .loginEvents(userId)
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="min-h-screen bg-figma-cream flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mb-12">
          <Link
            href="/account/settings"
            className="w-10 h-10 flex items-center justify-center rounded-full border border-gray-200 bg-[#FFFFFF] text-gray-600 hover:bg-[#F9F9F9] transition-colors shadow-sm shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-[28px] sm:text-[32px] font-extrabold text-gray-900 tracking-tight mb-2">
              Login activity
            </h1>
            <p className="text-[15px] text-gray-500 max-w-2xl leading-relaxed">
              Review recent sign-ins to your account. If you notice any activity
              you don&apos;t recognize, secure your account immediately.
            </p>
          </div>
        </div>

        {authLoading || (isAuthenticated && loading) ? (
          <div className="py-24 flex justify-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !isAuthenticated ? (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-card py-16 text-center max-w-md mx-auto">
            <p className="text-4xl mb-3">🔒</p>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Sign in to view this</h2>
          </div>
        ) : events && events.length > 0 ? (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-card divide-y divide-gray-100 overflow-hidden">
            {events.map((event) => {
              const { device, isMobile } = parseUserAgent(event.user_agent);
              const Icon = isMobile ? Smartphone : Laptop;
              return (
                <div key={event.id} className="flex items-center gap-4 px-5 sm:px-6 py-4">
                  <div className="w-10 h-10 rounded-full bg-figma-navy/5 text-figma-navy flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{device}</p>
                    <p className="text-xs text-gray-500 truncate">
                      Signed in with {METHOD_LABELS[event.method] ?? event.method}
                      {event.ip_address ? ` · ${event.ip_address}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{timeAgo(event.created_at)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center text-center max-w-3xl mx-auto mt-16 sm:mt-24">
            <div className="mb-8 relative w-48 h-48 sm:w-64 sm:h-64">
              <Image
                src="/images/empty-states/yeti-back.png"
                alt="No recent activity to show"
                fill
                className="object-contain drop-shadow-md animate-floating"
              />
            </div>
            <h2 className="text-[22px] sm:text-[26px] font-bold text-gray-900 leading-snug">
              No recent activity to show
            </h2>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
