'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { CONSENT_KEY, OPEN_CONSENT_EVENT, readConsent, type ConsentChoice } from '@/lib/analytics';

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

const GA_INIT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`;
const META_INIT = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`;

/**
 * Cookie consent + analytics. Nothing is loaded and nothing is stored until the
 * visitor accepts (DPDP Act / GDPR style opt-in); declining keeps every tag off.
 * The choice can be changed any time from the footer's "Cookie settings".
 */
export default function ConsentAnalytics() {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = readConsent();
    setChoice(saved);
    setOpen(saved === null);
    setReady(true);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  const decide = (next: ConsentChoice) => {
    try {
      localStorage.setItem(CONSENT_KEY, next);
    } catch {
      /* private mode: the choice just lasts for this visit */
    }
    setChoice(next);
    setOpen(false);
  };

  if (!ready) return null;

  return (
    <>
      {choice === 'granted' && (
        <>
          <Analytics />
          {GA_ID && (
            <>
              <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
              <Script id="ga4-init" strategy="afterInteractive">
                {GA_INIT}
              </Script>
            </>
          )}
          {META_PIXEL_ID && (
            <Script id="meta-pixel" strategy="afterInteractive">
              {META_INIT}
            </Script>
          )}
        </>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Cookie preferences"
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:p-5"
        >
          <p className="text-sm text-gray-700">
            We use cookies to keep you signed in and, with your OK, to understand how the site is used and improve it.
            See our{' '}
            <Link href="/cookies" className="font-semibold text-figma-navy underline">
              cookie policy
            </Link>
            .
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => decide('denied')}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Essential only
            </button>
            <button
              type="button"
              onClick={() => decide('granted')}
              className="rounded-xl bg-figma-navy px-4 py-2 text-sm font-semibold text-white hover:bg-figma-navy/90"
            >
              Accept analytics
            </button>
          </div>
        </div>
      )}
    </>
  );
}
