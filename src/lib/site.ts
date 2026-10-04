// One place for the public identity of the site: used by metadata, structured
// data, the footer and the share image so they can never disagree.

export const SITE_NAME = "Hostiggo";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.hostiggo.com").replace(/\/+$/, "");
export const SITE_TAGLINE = "Book homestays across India";
export const SITE_DESCRIPTION =
  "Book verified homestays across India with all-in nightly prices, exact refund dates, secure Razorpay payments and WhatsApp booking updates.";
export const COMPANY_LEGAL_NAME = "Hostiggo Trips Private Limited";
export const SUPPORT_EMAIL = "support@hostiggo.com";
export const SUPPORT_PHONE_DISPLAY = "+91 84483 37674";

/** Digits only, country code included (wa.me format). Override per environment. */
const WHATSAPP_DIGITS = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "918448337674").replace(/\D/g, "");
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_DIGITS}?text=${encodeURIComponent("Hi Hostiggo, I need help with")}`;

/**
 * Social profiles. Only the ones configured are shown and put in structured
 * data -- we never link to a profile we aren't sure exists.
 */
export const SOCIAL_LINKS: Array<{ label: string; url: string }> = [
  { label: "Instagram", url: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? "" },
  { label: "Facebook", url: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? "" },
  { label: "X", url: process.env.NEXT_PUBLIC_X_URL ?? "" },
  { label: "LinkedIn", url: process.env.NEXT_PUBLIC_LINKEDIN_URL ?? "" },
  { label: "YouTube", url: process.env.NEXT_PUBLIC_YOUTUBE_URL ?? "" },
].filter((s) => /^https:\/\//.test(s.url));
