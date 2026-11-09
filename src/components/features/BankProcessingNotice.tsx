"use client";

import { Loader2, RotateCcw } from "lucide-react";

interface Props {
  /** True while more automatic retries are coming; false once we have stopped retrying on our own. */
  retrying: boolean;
  onRetry: () => void;
}

/**
 * Shown instead of a dead-end error when payment details can't be fetched (or a date hasn't arrived yet).
 * This is almost always a slow network or a bank / payment-partner delay, not something the host did wrong, so
 * we say that, keep retrying quietly, and only offer the manual button once we have stopped.
 */
export default function BankProcessingNotice({ retrying, onRetry }: Props) {
  return (
    <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
      <div className="flex items-center gap-2 font-semibold">
        {retrying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {retrying ? "We're still fetching your payment details" : "Your payment details are taking longer than usual"}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed">
        Please wait: the details are being fetched from the bank. Banks and payment partners can take a while to
        process payouts and dates, so some details may show up late.
        {retrying ? " This page updates by itself, so please stay with us." : " Your money is safe. Check again in a moment."}
      </p>
      {!retrying && (
        <button
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
        >
          <RotateCcw className="h-4 w-4" /> Check again
        </button>
      )}
    </div>
  );
}
