'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BadgeCheck, ShieldCheck } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { KycVerificationForm } from '@/app/kyc/_components/KycVerificationForm';
import { useAuth } from '@/context/AuthContext';
import { useKycStatus } from '@/hooks/useKycStatus';

export default function ProfileVerificationPage() {
  const router = useRouter();
  const { user, userId, loading: authLoading, isAuthenticated } = useAuth();
  const { status, loading: kycLoading } = useKycStatus();
  const isVerified = status === 'verified' || user?.is_verified === true;

  return (
    <div className="min-h-screen bg-[#fffef9]">
      <Navbar />

      <main className="container-main py-10 md:py-14">
        <div className="flex items-start gap-4 md:gap-5">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-gray-100 transition-all hover:text-blue-600 hover:shadow-[0_6px_24px_rgba(0,0,0,0.12)] active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#1a1a1a] md:text-4xl">
              Profile Verification
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-gray-500 md:text-base">
              Verify your government ID so hosts know they are welcoming a trusted guest.
              Guests do not need to verify bank details.
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,480px)_minmax(280px,1fr)] lg:items-start md:ml-[60px]">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-card md:p-7">
            {authLoading || kycLoading ? (
              <div className="py-16 text-center text-sm font-medium text-gray-500">Loading verification...</div>
            ) : !isAuthenticated || !userId ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-figma-navy/10 text-figma-navy">
                  <ShieldCheck className="h-7 w-7" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Sign in to verify</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
                  We will attach your verified ID status to your Hostiggo account.
                </p>
                <Link
                  href="/signin?redirect=/account/verification"
                  className="mt-5 inline-flex items-center justify-center rounded-xl bg-figma-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-figma-navy/90"
                >
                  Sign in
                </Link>
              </div>
            ) : (
              <KycVerificationForm
                userId={userId}
                defaultName={user?.name ?? ''}
                audience="guest"
                showSkip={false}
                onCompleted={() => router.push('/account/profile')}
                onSkipped={() => router.push('/account/profile')}
              />
            )}
          </section>

          <aside className="rounded-3xl border border-gray-200 bg-white p-6 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-700">
                <BadgeCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">
                  {isVerified ? 'Verified guest' : 'Get your verified badge'}
                </p>
                <p className="text-xs text-gray-500">Shown on your Hostiggo profile</p>
              </div>
            </div>

            <div className="mt-6 space-y-4 text-sm text-gray-600">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-figma-navy" />
                <p>Use PAN, eAadhaar PDF, or passport to verify your identity.</p>
              </div>
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-figma-navy" />
                <p>Hosts can see that your profile has passed identity checks.</p>
              </div>
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-figma-navy" />
                <p>Your bank account is never requested for guest verification.</p>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
