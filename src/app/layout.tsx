import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ListingFilterProvider } from '@/context/ListingFilterContext';
import { Toaster } from 'sonner';
import { NotificationProvider } from '@/context/NotificationContext';
// import { Analytics } from '@vercel/analytics/next';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hostiggo.com').replace(/\/$/, '');

// Figma "Website Guest UI/UX" uses Poppins (Regular/Medium/SemiBold/Bold)
// throughout -- this replaces the never-actually-loaded "Inter" fallback.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Hostiggo | Homestays & Unique Stays in India',
    template: '%s | Hostiggo',
  },
  description:
    'Book verified homestays, family-friendly stays, and unique properties across India with transparent pricing, secure payments, and easy host support.',
  applicationName: 'Hostiggo',
  keywords: [
    'homestays in India',
    'holiday homes',
    'vacation rentals India',
    'hostiggo',
    'book stay India',
    'verified homestays',
    'rental properties India',
  ],
  alternates: {
    canonical: '/',
    languages: {
      'en-IN': '/',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: siteUrl,
    siteName: 'Hostiggo',
    title: 'Hostiggo | Homestays & Unique Stays in India',
    description:
      'Discover verified stays, vacation homes, and local experiences across India with secure booking and transparent policies.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Hostiggo home page preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@hostiggo',
    creator: '@hostiggo',
    title: 'Hostiggo | Homestays & Unique Stays in India',
    description:
      'Discover verified stays, vacation homes, and local experiences across India with secure booking and transparent policies.',
    images: ['/twitter-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
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
        {/* <Analytics /> */}
      </body>
    </html>
  );
}
