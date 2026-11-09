import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Public pages (home, search, listings, help, legal) are crawlable. Everything
// private, transactional or machine-facing is not. This is the single source of
// robots.txt: a public/robots.txt next to it conflicts with this route.
const PRIVATE_PATHS = [
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
];

// AI search and assistant crawlers. They are welcome on the public site so
// answer engines can read and cite it; a crawler with its own group ignores the
// "*" group, so each one repeats the private-path rules.
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
