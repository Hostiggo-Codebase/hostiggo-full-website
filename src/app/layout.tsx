import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ListingFilterProvider } from '@/context/ListingFilterContext';
import { Toaster } from 'sonner';
import { NotificationProvider } from '@/context/NotificationContext';
import ConsentAnalytics from '@/components/ConsentAnalytics';
import JsonLd from '@/components/JsonLd';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, SOCIAL_LINKS, COMPANY_LEGAL_NAME, SUPPORT_EMAIL } from '@/lib/site';

// Figma "Website Guest UI/UX" uses Poppins (Regular/Medium/SemiBold/Bold)
// throughout -- this replaces the never-actually-loaded "Inter" fallback.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Each page's own URL, relative to metadataBase.
  alternates: { canonical: './' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_IN',
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: `${SITE_NAME}: ${SITE_TAGLINE}`, description: SITE_DESCRIPTION },
  formatDetection: { telephone: false },
};

const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      legalName: COMPANY_LEGAL_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      email: SUPPORT_EMAIL,
      ...(SOCIAL_LINKS.length ? { sameAs: SOCIAL_LINKS.map((s) => s.url) } : {}),
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      inLanguage: 'en-IN',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={poppins.variable} data-scroll-behavior="smooth">
      {/* Extensions like Grammarly inject data-* attributes on <body> before
          hydration; suppress that one-level attribute mismatch warning. */}
      <body className={poppins.className} suppressHydrationWarning>
        <AuthProvider>
          <ListingFilterProvider>
            <Toaster position="top-center" richColors closeButton />
            <NotificationProvider>{children}</NotificationProvider>
          </ListingFilterProvider>
        </AuthProvider>
        <JsonLd data={ORGANIZATION_JSON_LD} />
        <ConsentAnalytics />
      </body>
    </html>
  );
}
