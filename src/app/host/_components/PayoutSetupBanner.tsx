'use client';

import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';

export type PayoutBlocker = 'kyc' | 'bank' | 'payout';

const STEPS: Array<{ key: PayoutBlocker; label: string }> = [
  { key: 'kyc', label: 'Verify your identity (PAN)' },
  { key: 'bank', label: 'Verify your bank account' },
  { key: 'payout', label: 'Payout account created' },
];

/** Shown while a host's listings can't go live because payouts aren't set up. */
export default function PayoutSetupBanner({ blockers }: { blockers: PayoutBlocker[] }) {
  if (blockers.length === 0) return null;
  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="text-base font-bold text-amber-900">Finish payout setup to go live</h2>
      <p className="mt-1 text-sm text-amber-800">
        Your listings stay hidden from guests until we can pay you. This takes a few minutes.
      </p>
      <ol className="mt-4 space-y-2">
        {STEPS.map((s) => {
          const done = !blockers.includes(s.key);
          return (
            <li key={s.key} className="flex items-center gap-2 text-sm text-amber-900">
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <Circle className="h-4 w-4 text-amber-500" />
              )}
              <span className={done ? 'line-through opacity-60' : ''}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      <Link
        href="/host/settings?tab=payouts"
        className="mt-4 inline-flex rounded-xl bg-figma-navy px-4 py-2 text-sm font-semibold text-white hover:bg-figma-navy/90"
      >
        Set up payouts
      </Link>
    </div>
  );
}
