import type { Metadata } from 'next';
import Script from 'next/script';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import HeroSection from '@/components/features/HeroSection';
import HomeSections, { type HomeSection } from '@/components/features/HomeSections';
import { mapListingToProperty } from '@/lib/api';
import {
  getCachedLocations,
  getCachedHotelsTeaser,
} from '@/lib/services/cached-reference-data';

export const metadata: Metadata = {
  title: 'Homestays & Unique Stays in India',
  description:
    'Explore verified homes, villas, and budget-friendly stays across India with secure booking, flexible cancellations, and transparent pricing.',
  alternates: {
    canonical: '/',
  },
};

// Both Supabase clients (src/lib/supabase.ts, supabase-admin.ts) force
// `cache: "no-store"` on every fetch -- a deliberate earlier fix for an
// unrelated stale-cache bug. That's incompatible with static
// generation/ISR (`export const revalidate`): Next disallows a no-store
// fetch during a prerender pass and throws "Dynamic server usage", which
// briefly broke this page in production the first time this was tried
// with `force-dynamic` as a workaround -- but that traded away the fully
// static, edge-cached shell for a per-request serverless render, which
// pays a cold-start tax on the first hit after the function goes idle
// (measured live: ~850ms TTFB cold vs ~80ms warm).
//
// The real fix: getCachedLocations/getCachedHotelsTeaser now read through
// supabaseCacheable (src/lib/supabase.ts), which doesn't force no-store --
// unstable_cache's own revalidate window is already the freshness
// guarantee, so the inner no-store was redundant for these two calls
// specifically. That makes this page static-generation-safe again, so ISR
// (ready HTML served from cache, regenerated in the background) is back
// on the table instead of a cold lambda on every idle-then-visit.
export const revalidate = 60;

// Server Component: the "Popular stays" sections are fetched here, at
// request/build time, straight from the cached data-layer functions (no
// client-side fetch waterfall, no extra HTTP hop through our own /api/*
// routes). Only the geolocation-gated "near you" section -- which needs the
// browser Geolocation API -- lives in the client child (HomeSections).
async function loadHomeSections(): Promise<{ sections: HomeSection[]; error: boolean }> {
  try {
    const popularLocations = await getCachedLocations(true, 4);

    const loaded = await Promise.all(
      popularLocations.map(async (location: any) => {
        const cityName =
          location.district || location.lower_division_name || location.state || 'India';
        const rows = await getCachedHotelsTeaser(location.location_id, 4);
        return {
          id: String(location.location_id),
          title: `Popular stays in ${cityName}`,
          properties: (rows || []).map(mapListingToProperty).filter((item) => item.id),
        };
      }),
    );

    return { sections: loaded.filter((section) => section.properties.length > 0), error: false };
  } catch (err) {
    console.error('[home] failed to load Supabase listings:', err);
    return { sections: [], error: true };
  }
}

export default async function HomePage() {
  const { sections, error } = await loadHomeSections();

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hostiggo.com').replace(/\/$/, '');
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Hostiggo',
    url: siteUrl,
    description:
      'Hostiggo helps guests discover verified homestays and unique stays across India with secure booking and transparent policies.',
    publisher: {
      '@type': 'Organization',
      name: 'Hostiggo',
      url: siteUrl,
    },
  };

  return (
    <>
      <Script
        id="home-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <div className="min-h-screen bg-figma-cream">
        <Navbar />
        <HeroSection />
        <HomeSections initialSections={sections} initialError={error} />
        <Footer />
      </div>
    </>
  );
}
