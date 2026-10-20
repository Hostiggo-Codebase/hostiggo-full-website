import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Public pages (home, search, listings, help, legal) are crawlable. Everything
// private, transactional or machine-facing is not. This is the single source of
// robots.txt: a public/robots.txt next to it conflicts with this route.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/host/',
        '/account/',
        '/kyc',
        '/my-memories',
        '/wishlist',
        '/notifications',
        '/chat',
        '/onboarding',
        '/otp',
        '/signin',
        '/auth/',
        '/booking-confirmation/',
        '/selected-addons',
        '/refer/dashboard',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
