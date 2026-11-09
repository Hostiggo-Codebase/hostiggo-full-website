/** @type {import('next').NextConfig} */
// Content-Security-Policy, shipped REPORT-ONLY first: Google Maps, Razorpay
// Checkout and Supabase need a carefully tuned policy and an enforced wrong
// one breaks payments. Violations are POSTed to /api/csp-report (see server
// logs). Once a week of real traffic is clean, rename the header below to
// `Content-Security-Policy` to enforce it.
const isDev = process.env.NODE_ENV !== 'production';
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://checkout.razorpay.com https://maps.googleapis.com https://va.vercel-scripts.com https://www.googletagmanager.com https://connect.facebook.net https://cdn.jsdelivr.net https://*.surepass.app https://vercel.live https://*.vercel.live`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://api.razorpay.com https://lumberjack.razorpay.com https://vitals.vercel-insights.com https://www.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com https://connect.facebook.net https://*.surepass.app https://vercel.live https://*.vercel.live",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com https://vercel.live https://*.vercel.live https://*.surepass.app https://*.digilocker.gov.in https://digilocker.meripehchaan.gov.in",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'report-uri /api/csp-report',
].join('; ');

const PRIVATE_PATHS = [
  '/api/:path*',
  '/host/:path*',
  '/account/:path*',
  '/kyc/:path*',
  '/my-memories/:path*',
  '/wishlist/:path*',
  '/notifications/:path*',
  '/chat/:path*',
  '/onboarding/:path*',
  '/otp/:path*',
  '/signin/:path*',
  '/auth/:path*',
  '/booking-confirmation/:path*',
  '/selected-addons/:path*',
  '/refer/dashboard/:path*',
];

// Baseline security headers for every response.
const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy-Report-Only', value: CSP },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Geolocation is used by "near me" search; camera/mic are never needed.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(self)' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // Private, transactional and machine-facing areas must never be indexed,
      // even if something links to them (robots.txt alone only stops crawling).
      ...PRIVATE_PATHS.map((source) => ({
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      })),
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'i.pravatar.cc' },
      { protocol: 'https', hostname: 'jhihqmkqvbwfniwculhk.supabase.co' },
      // Google account profile photos (user_metadata.avatar_url / picture
      // from Google OAuth) -- shown on the onboarding screen and profile.
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
    // Next 16 requires local images to be explicitly allow-listed,
    // especially ones with a query string (e.g. the hero photo's cache-
    // buster). Everything served from /public here is our own fixed,
    // trusted set of static assets, not a user-controlled path, so a broad
    // allow is safe.
    localPatterns: [{ pathname: '/**' }],
    // The hero image explicitly requests quality={95}; Next 16 requires
    // any quality value actually used in the app to be allow-listed here.
    qualities: [75, 95],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 604800,
    deviceSizes: [360, 640, 828, 1080, 1200, 1920],
  },
  // Proxy listing-search and location-lookup to the standalone Go search
  // service (github.com/Aryan-Arora/search-service-backend) instead of this
  // app's own route handlers. beforeFiles makes the rewrite win over the
  // filesystem routes at src/app/api/{search,locations}, so those route.ts
  // files never run while this is in place.
  //
  // /api/hotels is deliberately NOT proxied here: this app's route also
  // serves GET /api/hotels?ids=1,2,3 (card lookups for Recently Viewed /
  // wishlist, added after this Go service was first built), which the Go
  // service's HotelsService only supports as a location-scoped teaser
  // query (?locationId=&limit=), not an arbitrary ID list. Proxying it as-is
  // would silently return empty results for every ids= lookup. Add /api/hotels
  // back here once the Go service supports that query shape too.
  //
  // Opt-in: only proxied when SEARCH_SERVICE_URL is set. Unset, the in-app
  // routes serve search directly from Supabase (the same RPC). The external
  // service was returning 500 for every request (Sept 2026), which silently
  // took all search down -- the app must not depend on it by default.
  async rewrites() {
    const searchServiceUrl = process.env.SEARCH_SERVICE_URL;
    if (!searchServiceUrl) return [];
    return {
      beforeFiles: [
        { source: '/api/search', destination: `${searchServiceUrl}/api/search` },
        { source: '/api/locations', destination: `${searchServiceUrl}/api/locations` },
      ],
    };
  },
};

module.exports = nextConfig;
