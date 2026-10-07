'use client';

import Link from 'next/link';
import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKycStatus } from '@/hooks/useKycStatus';

export type ProfileCompletionInput = {
  avatar?: string | null;
  about: string;
  email?: string;
  phone?: string;
  listings: number;
};

type Step = {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  href?: string;
  /** Steps without an href act on the page itself (e.g. open the photo picker). */
  onClick?: () => void;
};

/**
 * Guided "finish your host profile" checklist for /host/account. Shows
 * progress and a single Continue button that jumps to the first incomplete
 * step, so a host always knows what to do next. Renders nothing once every
 * step is done. Identity status comes from the same useKycStatus hook the
 * dashboard banner uses; while it resolves (or can't be resolved) that step
 * is simply not counted as blocking.
 */
export default function ProfileCompletionCard({
  profile,
  onPickPhoto,
}: {
  profile: ProfileCompletionInput;
  onPickPhoto: () => void;
}) {
  const { status: kycStatus, loading: kycLoading } = useKycStatus();
  const kycKnown = !kycLoading && kycStatus !== 'unknown';

  const steps: Step[] = [
    {
      key: 'photo',
      label: 'Add a profile photo',
      hint: 'Guests book hosts they can put a face to.',
      done: Boolean(profile.avatar),
      onClick: onPickPhoto,
    },
    {
      key: 'about',
      label: 'Write your host bio',
      hint: 'A couple of sentences about you and your hosting style.',
      done: Boolean(profile.about.trim()),
      href: '/host/settings?tab=personal',
    },
    {
      key: 'contact',
      label: 'Confirm email and phone',
      hint: 'So we can reach you about bookings.',
      done: Boolean(profile.email?.trim()) && Boolean(profile.phone?.trim()),
      href: '/host/settings?tab=personal',
    },
    ...(kycKnown
      ? [
          {
            key: 'identity',
            label: 'Verify your identity',
            hint:
              kycStatus === 'pending'
                ? 'Your verification is being reviewed.'
                : 'Builds guest trust and unlocks payouts without holds.',
            // 'pending' means submitted -- nothing more for the host to do.
            done: kycStatus === 'verified' || kycStatus === 'pending',
            href: '/host/settings?tab=payouts',
          },
        ]
      : []),
    {
      key: 'listing',
      label: 'Create your first listing',
      hint: 'Add a property so guests can start booking.',
      done: profile.listings > 0,
      href: '/host/list/method',
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const percent = Math.round((doneCount / steps.length) * 100);
  const next = steps.find((s) => !s.done)!;

  const ctaClass =
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-figma-navy px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-figma-navy/90';

  return (
    <section
      aria-labelledby="profile-completion-title"
      className="mb-6 rounded-3xl border border-figma-navy/15 bg-figma-navy/5 p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="profile-completion-title" className="text-base font-bold text-gray-900">
            Finish setting up your host profile
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {doneCount} of {steps.length} done. Next up: {next.label.toLowerCase()}.
          </p>
        </div>
        {next.href ? (
          <Link href={next.href} className={ctaClass}>
            Continue <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <button type="button" onClick={next.onClick} className={ctaClass}>
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Profile completion"
        className="mt-4 h-2 overflow-hidden rounded-full bg-figma-navy/10"
      >
        <div
          className="h-full rounded-full bg-figma-navy transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="mt-5 space-y-1">
        {steps.map((s) => {
          const row = (
            <>
              {s.done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-gray-300" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-sm font-semibold',
                    s.done ? 'text-gray-400 line-through' : 'text-gray-900',
                  )}
                >
                  {s.label}
                </span>
                {!s.done && <span className="block text-xs text-gray-500">{s.hint}</span>}
              </span>
              {!s.done && <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />}
            </>
          );
          const rowClass = 'flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left';
          if (s.done) {
            return (
              <li key={s.key} className={rowClass}>
                {row}
              </li>
            );
          }
          return (
            <li key={s.key}>
              {s.href ? (
                <Link href={s.href} className={cn(rowClass, 'transition-colors hover:bg-white/70')}>
                  {row}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={s.onClick}
                  className={cn(rowClass, 'transition-colors hover:bg-white/70')}
                >
                  {row}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
