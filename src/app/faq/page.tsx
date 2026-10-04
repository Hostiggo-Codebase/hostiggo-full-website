'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { cn } from '@/lib/utils';

type QA = { q: string; a: string };
type Category = { title: string; items: QA[] };

const CATEGORIES: Category[] = [
  {
    title: 'Booking & payments',
    items: [
      {
        q: 'How do I pay for a booking?',
        a: 'Payment happens on Hostiggo through Razorpay at the time you book — you never pay a host directly. Your booking is only confirmed once the payment is verified.',
      },
      {
        q: 'Why was my card charged before the host confirmed?',
        a: "Most listings are instant-book, so payment and confirmation happen together. If a charge appears without a confirmed booking, contact support — see our Report an issue page.",
      },
      {
        q: 'Can I change my booking dates after paying?',
        a: 'Date changes go through the same flow as a cancellation and rebooking, since pricing and availability can differ. Check the listing\'s cancellation policy first.',
      },
    ],
  },
  {
    title: 'Cancellations & refunds',
    items: [
      {
        q: 'What cancellation policy applies to my booking?',
        a: "The policy shown at checkout for that specific listing is the one that applies — it's locked in at the time you book, not whatever is shown later.",
      },
      {
        q: 'How long do refunds take?',
        a: 'Refunds are calculated automatically based on the cancellation policy and initiated right away — it takes 5-7 banking days to reach your account, depending on your bank or card issuer.',
      },
      {
        q: 'Can a host refuse to refund me?',
        a: "No — refunds follow the platform-enforced policy shown at checkout, not something negotiated with the host. See our Cancellation & Refund Policy for the exact rules.",
      },
    ],
  },
  {
    title: 'Hosting',
    items: [
      {
        q: 'How do I list my property?',
        a: 'Start from Become a host — you\'ll go through identity verification, then set up your listing details, photos, pricing, and house rules.',
      },
      {
        q: 'When do I get paid as a host?',
        a: "Payouts are released after guest check-in, once the cancellation window for that booking has passed. You can track earnings from your host dashboard.",
      },
      {
        q: 'Can I set my own cancellation policy?',
        a: 'You choose from the cancellation policy options available on your listing settings — but whichever one you pick is the one enforced automatically, for every booking.',
      },
    ],
  },
  {
    title: 'Account & safety',
    items: [
      {
        q: 'Is my personal data shared with hosts or guests?',
        a: "Only what's needed to complete a booking (name, contact details for coordinating the stay). See our Privacy Policy for the full picture.",
      },
      {
        q: 'How do I report a safety concern or a listing that looks wrong?',
        a: 'Use Report an issue or see our Safety Information page — safety and payment issues are prioritized with a target response time of under 4 hours.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Account deletion is available from your profile settings. Deleting your account does not cancel bookings that are already in progress.',
      },
    ],
  },
];

function FaqItem({
  item,
  open,
  onToggle,
}: {
  item: QA;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-figma-border last:border-b-0 py-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="text-[15px] font-semibold text-figma-ink">
          {item.q}
        </span>
        <ChevronDown
          className={cn(
            'w-5 h-5 shrink-0 text-figma-navy transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <p className="mt-3 text-[15px] leading-7 text-figma-ink/70">
          {item.a}
        </p>
      )}
    </div>
  );
}

export default function FaqPage() {
  // Keyed "categoryIndex-itemIndex" so state stays independent per category.
  const [openKey, setOpenKey] = useState<string | null>('0-0');

  return (
    <div className="min-h-screen bg-figma-cream">
      <Navbar />
      <main className="container-main py-10 md:py-14">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-figma-ink/60 hover:text-figma-navy mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back to home
        </Link>

        <header className="mb-10 max-w-2xl">
          <h1 className="text-3xl md:text-4xl font-bold text-figma-ink mb-3">
            Frequently Asked Questions
          </h1>
          <p className="text-[15px] leading-7 text-figma-ink/80">
            Answers to the most common questions about booking, payments,
            hosting, and your account. Can&apos;t find what you need?{' '}
            <Link href="/contact" className="text-figma-navy underline">
              Contact us
            </Link>
            .
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CATEGORIES.map((category, ci) => (
            <section
              key={category.title}
              className="bg-white rounded-3xl border border-figma-border p-6 md:p-8"
            >
              <h2 className="text-lg font-semibold text-figma-ink mb-2">
                {category.title}
              </h2>
              <div>
                {category.items.map((item, ii) => {
                  const key = `${ci}-${ii}`;
                  return (
                    <FaqItem
                      key={key}
                      item={item}
                      open={openKey === key}
                      onToggle={() =>
                        setOpenKey((current) => (current === key ? null : key))
                      }
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-figma-navy px-6 py-8 text-center">
          <h3 className="text-lg md:text-xl font-bold text-white mb-2">
            Still stuck?
          </h3>
          <p className="text-sm text-white/80 mb-4">
            Reach our support team directly and we&apos;ll get back to you.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-white text-figma-navy text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            Contact us
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
