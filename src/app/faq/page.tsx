'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { cn } from '@/lib/utils';
import { CATEGORIES, type QA } from './faqData';


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
