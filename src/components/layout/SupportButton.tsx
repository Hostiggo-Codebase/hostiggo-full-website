import Link from 'next/link';
import { Headphones } from 'lucide-react';

export default function SupportButton() {
  return (
    <Link
      href="/support"
      prefetch={false}
      aria-label="Contact Hostiggo support"
      className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-white/20 bg-figma-navy px-4 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-figma-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-figma-navy focus-visible:ring-offset-4 md:bottom-6 md:right-6"
    >
      <Headphones aria-hidden="true" className="h-5 w-5 shrink-0" />
      <span>Support</span>
    </Link>
  );
}
