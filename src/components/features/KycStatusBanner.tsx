'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useKycStatus } from '@/hooks/useKycStatus';
import KycModal from '@/components/features/KycModal';

const DEFAULT_REJECTED_REASON =
  'We could not verify the PAN you submitted. Please double-check the number and re-submit to finish verification.';

type Tone = 'amber' | 'blue' | 'red';

const TONES: Record<Tone, { wrap: string; icon: string; title: string; body: string; cta: string }> = {
  amber: {
    wrap: 'bg-amber-50 border-amber-200',
    icon: 'bg-amber-100 text-amber-700',
    title: 'text-amber-900',
    body: 'text-amber-800',
    cta: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  blue: {
    wrap: 'bg-figma-navy/5 border-figma-navy/15',
    icon: 'bg-figma-navy/10 text-figma-navy',
    title: 'text-gray-900',
    body: 'text-gray-600',
    cta: 'bg-figma-navy hover:bg-figma-navy/90 text-white',
  },
  red: {
    wrap: 'bg-red-50 border-red-200',
    icon: 'bg-red-100 text-red-700',
    title: 'text-red-900',
    body: 'text-red-800',
    cta: 'bg-red-600 hover:bg-red-700 text-white',
  },
};

/**
 * Dashboard-wide reminder that identity KYC (PAN) still needs
 * attention. Rendered at the top of every host dashboard page (see
 * HostDashboardShell). The KYC form is never auto-popped anywhere -- this
 * banner's button is the only thing that opens it, so verification stays
 * entirely host-initiated. Hidden once verification is complete, while
 * status is still loading, or if it can't be resolved at all.
 */
export default function KycStatusBanner() {
  const router = useRouter();
  const { userId, user } = useAuth();
  const { status, reason, loading, refresh } = useKycStatus();
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  if (loading || dismissed) return null;
  if (status === 'verified' || status === 'unknown') return null;

  const content =
    status === 'rejected'
        ? {
            tone: 'red' as Tone,
            Icon: ShieldAlert,
            title: 'Your KYC could not be verified',
            body: reason || DEFAULT_REJECTED_REASON,
            ctaLabel: 'Re-submit KYC',
          }
        : {
            // status === 'none'
            tone: 'amber' as Tone,
            Icon: ShieldAlert,
            title: 'All hosts are requested to verify their identity',
            body: 'Complete your identity verification to build guest trust, rank higher in search results, and receive payouts without holds.',
            ctaLabel: 'Complete KYC',
          };

  const t = TONES[content.tone];
  const showCta = Boolean(content.ctaLabel && userId);

  const ctaButton = (extra: string) =>
    showCta ? (
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={cn(
          'whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-colors',
          t.cta,
          extra,
        )}
      >
        {content.ctaLabel}
      </button>
    ) : null;

  return (
    <div className={cn('mb-6 rounded-2xl border px-4 py-4 sm:px-5', t.wrap)}>
      <div className="flex items-start gap-3.5">
        <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', t.icon)}>
          <content.Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-bold', t.title)}>{content.title}</p>
          <p className={cn('mt-0.5 text-sm leading-relaxed', t.body)}>{content.body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ctaButton('hidden sm:inline-flex')}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {ctaButton('mt-3 flex w-full items-center justify-center sm:hidden')}

      {userId && (
        <KycModal
          open={modalOpen}
          userId={userId}
          defaultName={user?.name ?? ''}
          onCompleted={() => {
            setModalOpen(false);
            refresh();
          }}
          onSkipped={() => setModalOpen(false)}
          onSetupPayouts={() => {
            setModalOpen(false);
            refresh();
            router.push('/host/settings?tab=payouts');
          }}
        />
      )}
    </div>
  );
}
