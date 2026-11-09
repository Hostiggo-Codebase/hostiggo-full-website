'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Headphones, Mail, MessageCircle, Phone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import EmailLink from '@/components/support/EmailLink';
import { SUPPORT_PHONE_DISPLAY, WHATSAPP_URL } from '@/lib/site';

const SupportLiveChat = dynamic(() => import('@/components/features/SupportLiveChat'), {
  loading: () => <p className="py-4 text-sm text-gray-500">Loading support chat…</p>,
});

const options = [
  { label: 'Help centre & FAQs', href: '/help' },
  { label: 'Report a booking or property issue', href: '/report-issue' },
  { label: 'Refunds & cancellations', href: '/help/refunds' },
  { label: 'Host earnings & payouts', href: '/help/payouts' },
  { label: 'Feedback & suggestions', href: '/support' },
];

export default function SupportButton() {
  const pathname = usePathname();
  // Remount on navigation so an open panel never follows the user to a new page.
  if (['/signin', '/otp', '/auth', '/onboarding'].some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return null;
  }
  return <SupportPanel key={pathname} />;
}

function SupportPanel() {
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const actionClass = 'flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-figma-navy hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-figma-navy';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Contact Hostiggo support"
          className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-white/20 bg-figma-navy px-4 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-figma-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-figma-navy focus-visible:ring-offset-4 md:bottom-6 md:right-6"
        >
          <Headphones aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span>Support</span>
        </button>
      </DialogTrigger>
      <DialogContent className="left-auto right-4 top-auto bottom-[calc(1rem+env(safe-area-inset-bottom))] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm translate-x-0 translate-y-0 overflow-y-auto rounded-2xl border-gray-200 bg-white p-5 text-gray-900 md:bottom-6 md:right-6 motion-reduce:animate-none">
        <div className="pr-6">
          <DialogTitle className="text-xl text-figma-navy">How can we help?</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-gray-500">Get in touch with the Hostiggo team.</DialogDescription>
        </div>
        <div className="space-y-2">
          <div className="rounded-xl border border-gray-200 px-3 py-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-figma-navy"><Mail aria-hidden="true" className="h-4 w-4" /> Email us</div>
            <EmailLink email="hostiggo@gmail.com" className="text-sm text-figma-navy underline underline-offset-2" />
          </div>
          <a href={`tel:${SUPPORT_PHONE_DISPLAY.replace(/\s/g, '')}`} className={actionClass}><Phone aria-hidden="true" className="h-4 w-4" />{SUPPORT_PHONE_DISPLAY}</a>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={actionClass}><MessageCircle aria-hidden="true" className="h-4 w-4" />WhatsApp support<span className="sr-only"> (opens in a new tab)</span></a>
          <button type="button" onClick={() => setChatOpen(!chatOpen)} aria-expanded={chatOpen} aria-controls="floating-support-chat" className={`${actionClass} w-full`}><Headphones aria-hidden="true" className="h-4 w-4" />{chatOpen ? 'Hide live chat' : 'Live chat with support'}</button>
        </div>
        {chatOpen && <div id="floating-support-chat"><SupportLiveChat /></div>}
        <nav aria-label="Support options" className="border-t border-gray-100 pt-2">
          {options.map((option) => (
            <Link key={option.href} href={option.href} prefetch={false} onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-lg px-2 py-2 text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-figma-navy">{option.label}</Link>
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
