'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HelpCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useListingDraft } from '@/context/ListingDraftContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Ordered list of the listing-creation wizard steps.
export const WIZARD_STEPS = [
  { slug: 'property-type', label: 'Property type' },
  { slug: 'stay-type', label: 'Stay type' },
  { slug: 'location', label: 'Location' },
  { slug: 'address', label: 'Address' },
  { slug: 'capacity', label: 'Capacity' },
  { slug: 'amenities', label: 'Amenities' },
  { slug: 'addons', label: 'Add-ons' },
  { slug: 'photos', label: 'Photos' },
  { slug: 'details', label: 'Details' },
  { slug: 'pricing', label: 'Pricing' },
  { slug: 'discount', label: 'Discounts' },
  { slug: 'cancellation-policy', label: 'Cancellation policy' },
  { slug: 'house-rules', label: 'House rules' },
  // The former final "Verification" step (scan a QR code / record a video in
  // the Hostiggo mobile app) was removed: the app doesn't exist yet, so it
  // was a dead end. House rules is now the last step and its button is
  // "Finish", which submits the listing.
] as const;

export const WIZARD_TOTAL = WIZARD_STEPS.length;

export default function WizardShell({
  step,
  title,
  subtitle,
  children,
  nextLabel = 'Next',
  nextDisabled = false,
}: {
  step: number; // 1-based
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  const router = useRouter();
  const { submit, submitting } = useListingDraft();
  const idx = step - 1;
  const prev = WIZARD_STEPS[idx - 1];
  const next = WIZARD_STEPS[idx + 1];
  const progress = Math.round((step / WIZARD_TOTAL) * 100);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  return (
    <div className="host-dashboard min-h-screen flex flex-col bg-[#f0f2f5] text-gray-800">
      {/* Top bar */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-4 sm:px-6 md:px-16 lg:px-20 h-16 sm:h-20 bg-white shadow-sm border-b border-gray-100">
        <Link
          href="/"
          className="text-xl font-extrabold tracking-tight text-gray-900 flex items-center"
        >
          <span>HOSTI<span className="text-figma-navy">GGO</span></span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/host/listings"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            Save &amp; Exit
          </Link>
          <Link
            href="/support"
            className="text-figma-navy hover:bg-figma-navy/5 transition-colors p-2 rounded-full"
            aria-label="Help"
          >
            <HelpCircle className="w-5 h-5" />
          </Link>
        </div>
      </header>

      {/* Progress bar */}
      <div className="fixed top-16 sm:top-20 left-0 w-full h-1 bg-gray-200 z-40">
        <div
          className="h-full bg-figma-navy transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
        <span className="sr-only">
          Step {step} of {WIZARD_TOTAL}
        </span>
      </div>

      {/* Content */}
      <main className="flex-grow pt-28 sm:pt-32 pb-28 sm:pb-32 px-4 md:px-12 w-full">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-figma-navy mb-2">
              Step {step} of {WIZARD_TOTAL}
            </p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2">
              {title}
            </h1>
            {subtitle && (
              <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-3xl leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          {children}
        </div>
      </main>

      {/* Footer nav */}
      <footer className="fixed bottom-0 left-0 w-full z-50 flex justify-between items-center px-4 sm:px-6 md:px-16 lg:px-20 py-3 sm:py-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white border-t border-gray-200 shadow-lg">
        <button
          type="button"
          onClick={() =>
            prev ? router.push(`/host/list/${prev.slug}`) : setShowExitConfirm(true)
          }
          className="px-5 sm:px-6 py-3 sm:py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all active:scale-95"
        >
          Back
        </button>
        <div className="flex items-center gap-4">
          <Link
            href="/support"
            className="hidden md:block text-sm font-medium text-gray-500 hover:underline"
          >
            Need help?
          </Link>
          <button
            type="button"
            disabled={nextDisabled || submitting}
            aria-disabled={nextDisabled || submitting}
            onClick={() => {
              if (next) router.push(`/host/list/${next.slug}`);
              else submit();
            }}
            className={cn(
              'rounded-lg px-6 sm:px-8 py-3 sm:py-2.5 text-sm font-bold text-white transition-all active:scale-95 shadow-sm flex items-center gap-2',
              nextDisabled || submitting
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-figma-navy hover:bg-figma-navy/90',
            )}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {next ? nextLabel : submitting ? 'Creating…' : 'Finish'}
          </button>
        </div>
      </footer>

      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll lose your progress on this listing. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => router.push('/host/listings')}
              className="bg-figma-navy hover:bg-figma-navy/90"
            >
              Yes, leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Shared option-card primitive used across several wizard steps.
export function OptionCard({
  selected,
  onClick,
  children,
  className,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left bg-white border rounded-2xl p-5 transition-all shadow-card hover:-translate-y-0.5',
        selected
          ? 'border-figma-navy ring-1 ring-figma-navy bg-figma-navy/4'
          : 'border-gray-200 hover:border-gray-300',
        className,
      )}
    >
      {children}
    </button>
  );
}
