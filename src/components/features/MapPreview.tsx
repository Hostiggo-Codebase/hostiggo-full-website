'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useListingState } from '@/context/ListingFilterContext';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/services/googleMaps';

const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'New Delhi': { lat: 28.6139, lng: 77.209 },
  Manali: { lat: 32.2396, lng: 77.1887 },
  Shimla: { lat: 31.1048, lng: 77.1734 },
  Jaipur: { lat: 26.9124, lng: 75.7873 },
  Bangalore: { lat: 12.9716, lng: 77.5946 },
  Rishikesh: { lat: 30.0869, lng: 78.2676 },
  Goa: { lat: 15.2993, lng: 74.124 },
  Dharamshala: { lat: 32.219, lng: 76.3234 },
  Kasol: { lat: 32.0109, lng: 77.313 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
};

// Whole-state destinations (shown at a wider zoom than cities). Matched
// before listing coordinates, which can be wrong or far apart.
const REGION_COORDINATES: Record<string, { lat: number; lng: number }> = {
  Uttarakhand: { lat: 30.0668, lng: 79.0193 },
  'Himachal Pradesh': { lat: 31.9, lng: 77.2 },
  Rajasthan: { lat: 26.9, lng: 73.8 },
  Karnataka: { lat: 14.8, lng: 75.7 },
  'West Bengal': { lat: 23.4, lng: 87.9 },
  Sikkim: { lat: 27.53, lng: 88.51 },
  Kerala: { lat: 10.4, lng: 76.4 },
};

const INDIA_CENTER = { lat: 22.5937, lng: 78.9629 };

const PIN_PATH =
  'M12 2C7.58 2 4 5.58 4 10c0 5.25 8 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8zm0 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z';

interface MapPreviewProps {
  city?: string;
  count?: number;
  coordinates?: { lat: number; lng: number };
  // Opens the full interactive map (the results page's map view). The
  // preview itself is a static thumbnail, so without this a click on it
  // did nothing.
  onOpen?: () => void;
}

export default function MapPreview({
  city = 'New Delhi',
  count = 0,
  coordinates,
  onOpen,
}: MapPreviewProps) {
  // The search response carries the searched region's bounds (e.g. a whole
  // state like "Uttarakhand") and the listings' own coordinates. The preview
  // used to look the destination up only in the small CITY_COORDINATES table;
  // anything not in it fell back to the centre of India at street zoom, so
  // the thumbnail showed unrelated villages instead of the searched place.
  const { stateBounds, allProperties } = useListingState();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);

  const getCenter = () => {
    if (coordinates) return { lat: coordinates.lat, lng: coordinates.lng };

    for (const [name, coords] of Object.entries(CITY_COORDINATES)) {
      if (city.toLowerCase().includes(name.toLowerCase())) return coords;
    }
    return INDIA_CENTER;
  };

  // See InteractiveMap's identical hook for why this is needed: a bad or
  // restricted API key reports through this global callback, not by
  // rejecting loadGoogleMaps() or throwing synchronously.
  useEffect(() => onGoogleMapsAuthFailure(() => setMapUnavailable(true)), []);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current || mapInstanceRef.current) return;

        const center = getCenter();

        // Previously unguarded -- a bad key made this throw and left
        // mapLoaded stuck at false forever, so every one of these previews
        // spun its loading indicator indefinitely instead of ever showing
        // an end state.
        try {
          const map = new google.maps.Map(mapRef.current, {
            center,
            zoom: 11,
            disableDefaultUI: true,
            draggable: false,
            scrollwheel: false,
            keyboardShortcuts: false,
          });

          markerRef.current = new google.maps.Marker({
            position: center,
            map,
            icon: {
              path: PIN_PATH,
              fillColor: '#ef4444',
              fillOpacity: 1,
              strokeWeight: 0,
              scale: 1.6,
              anchor: new google.maps.Point(12, 22),
            },
          });

          mapInstanceRef.current = map;
          setMapLoaded(true);
        } catch (err) {
          console.error('[MapPreview] Failed to initialize Google Maps:', err);
          setMapUnavailable(true);
        }
      })
      .catch((err) => {
        console.error('[MapPreview] Failed to load Google Maps:', err);
        setMapUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Frame the searched place: explicit coordinates, then the known city /
  // state tables, then the region bounds from the search response, then the
  // listings' coordinates, then all of India.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded) return;
    const pts = allProperties
      .map((p) => p.coordinates)
      .filter((c): c is { lat: number; lng: number } => !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng));
    const name = city.toLowerCase();
    const knownCity = Object.entries(CITY_COORDINATES).find(([n]) => name.includes(n.toLowerCase()))?.[1];
    const knownRegion = Object.entries(REGION_COORDINATES).find(([n]) => name.includes(n.toLowerCase()))?.[1];
    let center: google.maps.LatLngLiteral;
    if (coordinates || knownCity) {
      center = (coordinates ?? knownCity)!;
      map.setCenter(center);
      map.setZoom(11);
    } else if (knownRegion) {
      center = knownRegion;
      map.setCenter(center);
      map.setZoom(6);
    } else if (stateBounds) {
      const b = new google.maps.LatLngBounds(
        { lat: stateBounds.south, lng: stateBounds.west },
        { lat: stateBounds.north, lng: stateBounds.east },
      );
      map.fitBounds(b, 8);
      center = b.getCenter().toJSON();
    } else if (pts.length > 0) {
      const b = new google.maps.LatLngBounds();
      pts.forEach((c) => b.extend(c));
      if (pts.length > 1) map.fitBounds(b, 16);
      else map.setZoom(11);
      center = b.getCenter().toJSON();
      map.setCenter(center);
    } else {
      center = INDIA_CENTER;
      map.setCenter(center);
      map.setZoom(4);
    }
    markerRef.current?.setPosition(center);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, coordinates, stateBounds, allProperties, mapLoaded]);

  return (
    <div
      className="rounded-2xl overflow-hidden border border-gray-100 relative"
      style={{ height: 160 }}
    >
      <div ref={mapRef} className="w-full h-full" />

      {onOpen && mapLoaded && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open map of ${city}`}
          className="absolute inset-0 z-[1] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-figma-navy"
        />
      )}

      {!mapLoaded && !mapUnavailable && (
        <div className="absolute inset-0 bg-figma-navy/5 flex items-center justify-center">
          <div className="text-center">
            <div className="w-6 h-6 border-2 border-figma-navy/40 border-t-transparent rounded-full animate-spin mx-auto mb-1.5" />
            <p className="text-[11px] text-figma-navy font-medium">Loading…</p>
          </div>
        </div>
      )}

      {mapUnavailable && (
        <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
          <div className="text-center px-4">
            <MapPin className="w-5 h-5 text-gray-300 mx-auto mb-1" />
            <p className="text-[11px] text-gray-500 font-medium">Map preview unavailable</p>
          </div>
        </div>
      )}

      {/* Overlay label */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-white/90 to-transparent py-2 px-3 pointer-events-none z-[2]">
        <p className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
          <MapPin className="w-3 h-3 text-figma-navy" />
          {city} · {count} properties
        </p>
      </div>
    </div>
  );
}
