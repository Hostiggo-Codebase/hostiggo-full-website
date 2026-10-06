'use client';

import { useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import PopularStays from '@/components/features/PopularStays';
import type { Property, SearchFilters } from '@/types';
import { api, mapListingToProperty } from '@/lib/api';

export type HomeSection = {
  id: string;
  title: string;
  properties: Property[];
};

// Default, unfiltered search -- both the "near you" and "popular cities"
// sections go through the same api.search() stack (the same one the
// search-results page uses), just with different destination/geo params.
const NO_FILTERS: SearchFilters = {
  priceMin: 0,
  priceMax: 100000,
  guestRating: null,
  propertyTypes: [],
  stayTypes: [],
  amenities: [],
  bedTypes: [],
  freeCancellation: false,
  breakfast: false,
  parking: false,
  wifi: false,
  ac: false,
  privateRoom: false,
  sharedRoom: false,
  doubleBed: false,
  coupleFriendly: false,
  familyFriendly: false,
};

type GeoState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

// Remembers the user's choice across refreshes so the banner doesn't nag on
// every page load -- once they've granted or denied, we respect that and
// only ask again if they explicitly clear it (e.g. browser site data reset).
const GEO_CHOICE_KEY = 'hostiggo:geo-choice';

interface HomeSectionsProps {
  initialSections: HomeSection[];
  initialError: boolean;
}

// The two "Popular stays" sections arrive pre-fetched from the Server
// Component parent (src/app/page.tsx) -- no client fetch/waterfall for
// them. Only the geolocation-gated "near you" section (which needs the
// browser Geolocation API) and the error-retry path are client-side work.
export default function HomeSections({ initialSections, initialError }: HomeSectionsProps) {
  const [sections, setSections] = useState<HomeSection[]>(initialSections);
  const [nearbyProperties, setNearbyProperties] = useState<Property[] | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [geoState, setGeoState] = useState<GeoState>('idle');
  const [error, setError] = useState(initialError);
  const [retryLoading, setRetryLoading] = useState(false);

  const fetchNearby = (latitude: number, longitude: number) => {
    setNearbyLoading(true);
    api
      .search(NO_FILTERS, '', 0, 8, { latitude, longitude })
      .then((rows) => {
        setNearbyProperties((rows || []).map(mapListingToProperty).filter((item) => item.id));
      })
      .catch((err) => {
        console.error('[home] failed to load nearby listings:', err);
        setNearbyProperties([]);
      })
      .finally(() => setNearbyLoading(false));
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoState('unsupported');
      return;
    }
    const storedChoice = localStorage.getItem(GEO_CHOICE_KEY);
    if (storedChoice === 'denied') {
      setGeoState('denied');
      return;
    }
    if (storedChoice === 'granted') {
      setGeoState('requesting');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoState('granted');
          fetchNearby(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          // Permission was revoked outside the app (browser settings) --
          // fall back to asking again rather than getting stuck.
          console.warn('[home] stored geo grant no longer valid:', err.message);
          localStorage.removeItem(GEO_CHOICE_KEY);
          setGeoState('idle');
        },
        { enableHighAccuracy: false, timeout: 10000 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestNearbyStays = () => {
    if (!navigator.geolocation) {
      setGeoState('unsupported');
      return;
    }
    setGeoState('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        localStorage.setItem(GEO_CHOICE_KEY, 'granted');
        setGeoState('granted');
        fetchNearby(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        console.warn('[home] geolocation denied/failed:', err.message);
        localStorage.setItem(GEO_CHOICE_KEY, 'denied');
        setGeoState('denied');
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  // Fallback client-side refetch, only used if the server-side fetch failed
  // (initialError) and the user clicks "Try again" -- normal loads never
  // hit this path since sections already arrive populated from the server.
  const retryLoad = async () => {
    setRetryLoading(true);
    setError(false);
    try {
      const popularLocations = await api.locations(4, undefined, true);
      const loaded = await Promise.all(
        popularLocations.map(async (location: any) => {
          const cityName =
            location.district || location.lower_division_name || location.state || 'India';
          const rows = await api.hotelsByLocation(location.location_id, 4);
          return {
            id: String(location.location_id),
            title: `Popular stays in ${cityName}`,
            properties: (rows || []).map(mapListingToProperty).filter((item) => item.id),
          };
        }),
      );
      setSections(loaded.filter((section) => section.properties.length > 0));
    } catch (err) {
      console.error('[home] retry failed to load Supabase listings:', err);
      setError(true);
    } finally {
      setRetryLoading(false);
    }
  };

  return (
    <div className="container-main py-8 space-y-10">
      {geoState === 'idle' && (
        <div className="bg-figma-navy/5 border border-figma-navy/10 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-figma-navy flex-shrink-0" />
            <p className="text-[13.5px] text-figma-navy font-medium">
              Share your location to see homestays near you first.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={requestNearbyStays}
              className="bg-figma-navy hover:bg-figma-navy/90 text-white text-[13px] font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              Use my location
            </button>
            <button
              onClick={() => {
                // Explicit opt-out without triggering the browser prompt --
                // previously the only way to make this banner go away was
                // clicking "Use my location" and denying the prompt.
                localStorage.setItem(GEO_CHOICE_KEY, 'denied');
                setGeoState('denied');
              }}
              aria-label="Dismiss location prompt"
              className="p-2 rounded-xl text-figma-navy/60 hover:text-figma-navy hover:bg-figma-navy/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {geoState === 'requesting' || nearbyLoading ? (
        <PopularStays
          title="Finding homestays near you..."
          properties={[]}
          isLoading={true}
          itemsPerRow={4}
        />
      ) : geoState === 'granted' && nearbyProperties && nearbyProperties.length > 0 ? (
        <PopularStays
          title="Homestays near you"
          properties={nearbyProperties}
          itemsPerRow={4}
        />
      ) : null}

      {retryLoading ? (
        <>
          <PopularStays
            title="Popular stays loading..."
            properties={[]}
            isLoading={true}
            itemsPerRow={4}
          />
          <PopularStays
            title="Popular stays loading..."
            properties={[]}
            isLoading={true}
            itemsPerRow={4}
          />
        </>
      ) : sections.length === 0 ? (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-card py-16 px-6 text-center">
            <p className="text-4xl mb-3">{error ? '😕' : '🏠'}</p>
            <h2 className="text-lg font-bold text-gray-800 mb-1">
              {error ? "We couldn't load stays right now" : 'No stays to show yet'}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {error
                ? 'Something went wrong reaching our listings. Please try again.'
                : 'Check back soon. New homestays are added regularly.'}
            </p>
            {error && (
              <button onClick={retryLoad} className="btn-primary">
                Try again
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {sections.slice(0, 2).map((section) => (
            <PopularStays key={section.id} title={section.title} properties={section.properties} />
          ))}
          {sections.slice(2).map((section) => (
            <PopularStays key={section.id} title={section.title} properties={section.properties} />
          ))}
        </>
      )}
    </div>
  );
}
