'use client';

import { OPEN_CONSENT_EVENT } from '@/lib/analytics';

/** Re-opens the cookie banner so a visitor can change their analytics choice. */
export default function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}>
      Cookie settings
    </button>
  );
}
