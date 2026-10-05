// Thin wrappers over the analytics tags that ConsentAnalytics loads. Safe to
// call anywhere: before consent (or with no ids configured) they do nothing.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

export const CONSENT_KEY = "hg_consent";
export const OPEN_CONSENT_EVENT = "hg:open-consent";

export type ConsentChoice = "granted" | "denied";

export function readConsent(): ConsentChoice | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

const META_EVENTS: Record<string, string> = {
  view_item: "ViewContent",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
  sign_up: "CompleteRegistration",
  search: "Search",
};

/** Standard GA4 / Meta events: view_item, begin_checkout, purchase, sign_up, search. */
export function track(event: string, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", event, params);
    if (META_EVENTS[event]) {
      window.fbq?.("track", META_EVENTS[event], {
        value: params.value,
        currency: params.currency,
        content_ids: params.item_id ? [String(params.item_id)] : undefined,
      });
    }
  } catch {
    // analytics must never break the page
  }
}
