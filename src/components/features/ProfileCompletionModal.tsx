'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getProfileCompletion, type CompletionInput, type CompletionTodo } from '@/lib/profileCompletion';

const ITEMS: { key: CompletionTodo['key']; label: string; cta: string }[] = [
  { key: 'name', label: 'Full name', cta: 'Add name' },
  { key: 'email', label: 'Email', cta: 'Add email' },
  { key: 'phone', label: 'Phone number', cta: 'Add phone number' },
  { key: 'dateOfBirth', label: 'Date of birth', cta: 'Add date of birth' },
  { key: 'gender', label: 'Gender', cta: 'Select gender' },
  { key: 'photo', label: 'Profile photo', cta: 'Upload photo' },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  completion: CompletionInput;
};

/**
 * "What is left" for the profile-completion bar. Every missing item has a
 * button that opens the page where it is fixed (the edit page, scrolled to and
 * focused on that field via ?focus=). Phone OTP verification is app-only, so a
 * saved-but-unverified phone gets a "verify in the app" note instead of a link.
 */
export default function ProfileCompletionModal({ open, onOpenChange, completion }: Props) {
  const { missing, percentage } = getProfileCompletion(completion);
  const todoFor = (key: string) => missing.find((m) => m.key === key)?.todo;
  const phoneNeedsApp = Boolean(completion.phone?.trim()) && !completion.phoneVerified;
  const emailNeedsAdd = !completion.email?.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] max-h-[90vh] overflow-y-auto bg-white text-gray-900">
        <DialogHeader>
          <DialogTitle>
            {missing.length === 0
              ? 'Your profile is complete'
              : `${missing.length} step${missing.length > 1 ? 's' : ''} left to complete your profile`}
          </DialogTitle>
          <DialogDescription>
            {missing.length === 0 ? 'Everything is filled in.' : `You're at ${percentage}%. Tap a step to finish it.`}
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-gray-100">
          {ITEMS.map(({ key, label, cta }) => {
            const isMissing = missing.some((m) => m.key === key);
            const appOnly = (key === 'phone' && phoneNeedsApp) || (key === 'email' && !emailNeedsAdd);
            return (
              <li key={key} className="flex items-start gap-3 py-3.5">
                {isMissing ? (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-gray-900">{label}</p>
                  <p className="text-[13px] text-gray-500">{isMissing ? todoFor(key) : 'Done'}</p>
                </div>
                {isMissing &&
                  (key === 'phone' && phoneNeedsApp ? (
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
                      <Smartphone className="h-3.5 w-3.5" /> In the app
                    </span>
                  ) : appOnly ? (
                    <Link
                      href={`/account/profile/edit?focus=${key}`}
                      className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[#0396EF] hover:underline"
                    >
                      Review <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <Link
                      href={`/account/profile/edit?focus=${key}`}
                      className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-[#004772] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#003655]"
                    >
                      {cta} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ))}
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
