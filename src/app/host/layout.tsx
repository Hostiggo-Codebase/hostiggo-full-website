'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const IS_DEV = process.env.NODE_ENV !== 'production';

export default function HostLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  // usePathname (not useSearchParams -- that requires a Suspense boundary
  // and this layout wraps statically-prerendered pages like /host/account)
  // is enough to preserve where the visitor was actually headed through the
  // sign-in flow, instead of dropping them on a generic page after auth.
  const pathname = usePathname();
  const signInHref = `/signin?redirect=${encodeURIComponent(pathname || '/host')}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-figma-navy animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-card border border-gray-200 max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-figma-navy/5 text-figma-navy flex items-center justify-center mx-auto mb-5">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Sign in to manage your hosting
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Your listings, bookings, and earnings live here. Sign in to continue.
          </p>
          <Link
            href={signInHref}
            className="block w-full bg-figma-navy text-white font-semibold py-3 rounded-xl hover:bg-figma-navy/90 transition-all"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
