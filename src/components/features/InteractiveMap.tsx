'use client';

import { formatINR } from '@/lib/format';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { StarIcon, X, CheckCircle, Navigation } from 'lucide-react';
import type { Property } from '@/types';
import { useListingState } from '@/context/ListingFilterContext';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/services/googleMaps';

const INDIA_CENTER = { lat: 22.5937, lng: 78.9629 };

interface InteractiveMapProps {
  properties: Property[];
  activeId?: string | null;
  onMarkerClick?: (id: string) => void;
  className?: string;
  pointer?: { lat: number; lng: number } | null;
  onPointerMoved?: (lat: number, lng: number) => void;
  reverseGeocodeEnabled?: boolean;
  // Fired once if the map fails to initialize (bad/missing API key, Maps
  // JS API not enabled, network block, etc.) so the parent can show a
  // friendly fallback -- without this the Google Maps SDK's own runtime
  // error (e.g. InvalidKeyMapError) was propagating up uncaught and
  // crashing to Next's generic "Something went wrong" page, taking the
  // entire search results view down with it, not just the map.
  onError?: () => void;
}

export default function InteractiveMap({
  properties,
  activeId,
  onMarkerClick,
  className = '',
  pointer,
  onPointerMoved,
  onError,
}: InteractiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const pointerMarkerRef = useRef<google.maps.Marker | null>(null);
  const stateBoundaryRef = useRef<google.maps.Polygon | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const router = useRouter();
  const { stateBounds, allProperties } = useListingState();

  const syncMapToPointer = useCallback(
    (lat: number, lng: number) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      map.panTo({ lat, lng });
      map.setZoom(13);

      if (pointerMarkerRef.current) {
        pointerMarkerRef.current.setMap(null);
      }

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        draggable: true,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 16,
          fillColor: '#004772',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 3,
        },
      });

      marker.addListener('dragend', () => {
        const pos = marker.getPosition();
        if (!pos) return;
        onPointerMoved?.(pos.lat(), pos.lng());
      });

      pointerMarkerRef.current = marker;
    },
    [onPointerMoved],
  );

  const createMarkerIcon = (property: Property, isActive: boolean) => {
    const bgColor = isActive ? '#003a5c' : '#004772';
    const borderColor = isActive ? 'white' : 'rgba(255,255,255,0.6)';
    const borderWidth = isActive ? 2.5 : 2;

    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 24,
      fillColor: bgColor,
      fillOpacity: 1,
      strokeColor: borderColor,
      strokeWeight: borderWidth,
    };
  };

  const createMarkerLabel = (property: Property): google.maps.MarkerLabel => ({
    text: `₹${Math.round(property.price / 1000)}k`,
    color: 'white',
    fontSize: '12px',
    fontWeight: '700',
  });

  const getCenter = (propsToUse: Property[] = properties) => {
    const withCoords = propsToUse.filter((p) => p.coordinates);
    if (withCoords.length === 0) return INDIA_CENTER;

    const lat =
      withCoords.reduce((sum, p) => sum + p.coordinates!.lat, 0) / withCoords.length;
    const lng =
      withCoords.reduce((sum, p) => sum + p.coordinates!.lng, 0) / withCoords.length;

    return { lat, lng };
  };

  const getZoom = (propsToUse: Property[] = properties): number => {
    const cities = new Set(propsToUse.map((p) => p.city));
    if (cities.size === 1) return 13;
    if (cities.size <= 3) return 10;
    return 5;
  };

  const addMarkers = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();

    if (stateBoundaryRef.current) {
      stateBoundaryRef.current.setMap(null);
      stateBoundaryRef.current = null;
    }

    // For state-level searches, show all properties from that state, not just paginated ones
    const displayProperties = allProperties.length > 0 ? allProperties : properties;
    const bounds = new google.maps.LatLngBounds();
    let hasCoords = false;

    displayProperties.forEach((property) => {
      if (!property.coordinates) return;
      hasCoords = true;

      const { lat, lng } = property.coordinates;
      bounds.extend({ lat, lng });

      const isActive = property.id === activeId;

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        title: property.propertyName,
        icon: createMarkerIcon(property, isActive),
        label: createMarkerLabel(property),
      });

      marker.addListener('click', () => {
        setSelectedProperty(property);
        onMarkerClick?.(property.id);
      });

      markersRef.current.set(property.id, marker);
    });

    if (stateBounds) {
      try {
        const boundsPath: google.maps.LatLngLiteral[] = [
          { lat: stateBounds.north, lng: stateBounds.west },
          { lat: stateBounds.north, lng: stateBounds.east },
          { lat: stateBounds.south, lng: stateBounds.east },
          { lat: stateBounds.south, lng: stateBounds.west },
        ];

        stateBoundaryRef.current = new google.maps.Polygon({
          paths: boundsPath,
          map,
          strokeColor: '#004772',
          strokeWeight: 2,
          strokeOpacity: 0.3,
          fillColor: '#004772',
          fillOpacity: 0.05,
        });
      } catch (e) {
        console.warn('[InteractiveMap] Failed to draw state boundary:', e);
      }
    }

    if (hasCoords && displayProperties.filter((p) => p.coordinates).length > 1) {
      map.fitBounds(bounds, 50);
    } else if (hasCoords) {
      const center = getCenter(displayProperties);
      map.setCenter(center);
      map.setZoom(getZoom(displayProperties));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, allProperties, activeId, stateBounds, onMarkerClick]);

  // Google reports a bad/restricted/unbilled key via this global callback,
  // not by rejecting loadGoogleMaps() or throwing from `new google.maps.Map`
  // -- see the comment on onGoogleMapsAuthFailure.
  useEffect(() => onGoogleMapsAuthFailure(() => onError?.()), [onError]);

  // Initialize Google Map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current || mapInstanceRef.current) return;

        // The Maps JS API doesn't reject loadGoogleMaps()'s promise for a
        // bad/restricted key -- the script itself loads fine, and the SDK
        // only throws once you actually try to construct a google.maps.Map
        // with it (InvalidKeyMapError and friends). Without this try/catch
        // that throw was uncaught, crashing the whole component tree up to
        // Next's default error page -- one bad API key took down the
        // entire search results view, not just the map panel.
        try {
          const map = new google.maps.Map(mapRef.current, {
            center: INDIA_CENTER,
            zoom: 5,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
          });

          map.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            syncMapToPointer(lat, lng);
            onPointerMoved?.(lat, lng);
          });

          mapInstanceRef.current = map;
          setMapLoaded(true);
        } catch (err) {
          console.error('[InteractiveMap] Failed to initialize Google Maps:', err);
          onError?.();
        }
      })
      .catch((err) => {
        console.error('[InteractiveMap] Failed to load Google Maps:', err);
        onError?.();
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-add markers when properties or allProperties change
  useEffect(() => {
    if (!mapLoaded) return;
    addMarkers();
  }, [mapLoaded, addMarkers]);

  // Update marker icons when active changes
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const property = properties.find((p) => p.id === id);
      if (property) {
        const isActive = id === activeId;
        marker.setIcon(createMarkerIcon(property, isActive));
      }
    });
  }, [activeId, properties]);

  // Sync external pointer marker
  useEffect(() => {
    if (!mapLoaded) return;
    if (pointer) {
      syncMapToPointer(pointer.lat, pointer.lng);
    } else if (pointerMarkerRef.current) {
      pointerMarkerRef.current.setMap(null);
      pointerMarkerRef.current = null;
    }
  }, [pointer, mapLoaded, syncMapToPointer]);

  return (
    <div className={`relative ${className}`}>
      {/* Map container */}
      <div ref={mapRef} className="w-full h-full rounded-2xl overflow-hidden" style={{ minHeight: 400 }} />

      {/* Loading overlay */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-figma-navy/5 rounded-2xl flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-figma-navy border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-figma-navy">Loading map…</p>
          </div>
        </div>
      )}

      {/* Property popup card */}
      {selectedProperty && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[300px] bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        >
          {/* Image */}
          <div className="relative h-36">
            <img
              src={selectedProperty.images[0]}
              alt={selectedProperty.propertyName}
              className="w-full h-full object-cover"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedProperty(null);
              }}
              className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors"
            >
              <X className="w-3.5 h-3.5 text-gray-600" />
            </button>
            {selectedProperty.originalPrice && (
              <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                -
                {Math.round(
                  ((selectedProperty.originalPrice - selectedProperty.price) /
                    selectedProperty.originalPrice) *
                    100,
                )}
                % OFF
              </div>
            )}
          </div>
          {/* Info */}
          <div className="p-3">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div>
                <span className="text-[10px] font-bold text-figma-navy bg-figma-navy/5 px-1.5 py-0.5 rounded-full">
                  {selectedProperty.propertyType}
                </span>
                <h4 className="text-[13px] font-bold text-gray-800 leading-snug mt-0.5 line-clamp-1">
                  {selectedProperty.propertyName}
                </h4>
                <p className="text-[11px] text-gray-400">
                  {selectedProperty.city}, {selectedProperty.state}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                {selectedProperty.originalPrice && (
                  <p className="text-[10px] text-gray-400 line-through">
                    {formatINR(selectedProperty.originalPrice)}
                  </p>
                )}
                <p className="text-[16px] font-extrabold text-figma-navy/90 leading-none">
                  {formatINR(selectedProperty.price)}
                </p>
                <p className="text-[9px] text-gray-400 font-medium">
                  per night
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-2.5">
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-1.5 py-0.5">
                <StarIcon className="w-3 h-3 text-amber-500 fill-amber-500" />
                <span className="text-[11px] font-bold text-amber-700">
                  {selectedProperty.rating > 0 ? selectedProperty.rating.toFixed(1) : 'New'}
                </span>
              </div>
              <span className="text-[11px] text-gray-400">
                {selectedProperty.reviewCount} reviews
              </span>
              {selectedProperty.freeCancellation && (
                <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5">
                  <CheckCircle className="w-2.5 h-2.5" /> Free cancel
                </span>
              )}
            </div>

            {/* Amenities */}
            <div className="flex gap-1.5 flex-wrap mb-3">
              {selectedProperty.amenities.slice(0, 3).map((am) => (
                <span
                  key={am}
                  className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-full"
                >
                  {am}
                </span>
              ))}
            </div>

            <button
              onClick={() => router.push(`/property/${selectedProperty.id}`)}
              className="w-full bg-figma-navy hover:bg-figma-navy/90 text-white py-2 rounded-xl text-[12px] font-semibold transition-colors"
            >
              View Details
            </button>
          </div>
        </div>
      )}

      {/* Property count badge */}
      {mapLoaded && (
        <div
          className="absolute top-3 left-3 z-[999] bg-white/95 backdrop-blur-sm rounded-full px-3 py-1.5 text-[12px] font-semibold text-gray-700"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
        >
          {(allProperties.length > 0 ? allProperties : properties).filter((p) => p.coordinates).length} properties
        </div>
      )}

      {/* Current location button */}
      {mapLoaded && (
        <button
          onClick={() => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                syncMapToPointer(lat, lng);
                onPointerMoved?.(lat, lng);
              },
              (err) => {
                console.warn('[InteractiveMap] Geolocation error:', err.message);
              },
              { enableHighAccuracy: true, timeout: 10000 },
            );
          }}
          className="absolute top-3 right-3 z-[999] bg-white/95 backdrop-blur-sm rounded-full px-3 py-2 text-[12px] font-semibold text-gray-700 hover:bg-white hover:shadow-md transition-all flex items-center gap-1.5"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
          title="Use current location"
        >
          <Navigation className="w-3.5 h-3.5 text-figma-navy" />
          Current location
        </button>
      )}
    </div>
  );
}
