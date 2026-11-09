'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Minus, LocateFixed, Loader2 } from 'lucide-react';
import { reverseGeocode } from '@/lib/services/geocoding';

// We'll use dynamic import to avoid SSR issues with the Google Maps script
import dynamic from 'next/dynamic';

const GoogleMap = dynamic(() => import('./GoogleMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[380px] md:h-[600px] bg-gray-100 rounded-2xl flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
    </div>
  ),
});

interface MapPickerProps {
  latitude?: number;
  longitude?: number;
  onLocationChange?: (lat: number, lng: number, address: string) => void;
  displayAddress?: string;
}

export default function MapPicker({
  latitude = 28.6139,
  longitude = 77.209,
  onLocationChange,
  displayAddress = '',
}: MapPickerProps) {
  const [location, setLocation] = useState({ lat: latitude, lng: longitude });
  const [address, setAddress] = useState(displayAddress);
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Keep the map in sync when the parent supplies new coordinates (e.g. the
  // user picked an address-search suggestion), the map only followed
  // marker-drags and "use current location" before this, silently ignoring
  // address search.
  useEffect(() => {
    setLocation({ lat: latitude, lng: longitude });
  }, [latitude, longitude]);

  useEffect(() => {
    if (displayAddress) setAddress(displayAddress);
  }, [displayAddress]);

  // Handle reverse geocoding when marker moves
  const handleMarkerMove = async (lat: number, lng: number) => {
    setLocation({ lat, lng });
    setLoading(true);

    const result = await reverseGeocode(lat, lng);
    if (result) {
      setAddress(result.displayName);
      onLocationChange?.(lat, lng, result.displayName);
    }

    setLoading(false);
  };

  // Get current browser location
  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported by your browser');
      return;
    }

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        setLocation({ lat, lng });

        const result = await reverseGeocode(lat, lng);
        if (result) {
          setAddress(result.displayName);
          onLocationChange?.(lat, lng, result.displayName);
        }

        setGettingLocation(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Unable to get your location');
        setGettingLocation(false);
      },
      { timeout: 10000 },
    );
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden shadow-card border border-gray-200 bg-gray-100">
      <GoogleMap
        latitude={location.lat}
        longitude={location.lng}
        onMarkerMove={handleMarkerMove}
        onMapClick={handleMarkerMove}
        allowClickToPlace={true}
      />

      {/* Zoom controls */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
        <button
          onClick={() => {
            const map = (window as any).__mapInstance;
            if (map) map.setZoom(map.getZoom() + 1);
          }}
          className="w-10 h-10 bg-white/90 rounded-lg flex items-center justify-center shadow-md hover:bg-white transition-colors"
          title="Zoom in"
        >
          <Plus className="w-5 h-5 text-gray-700" />
        </button>
        <button
          onClick={() => {
            const map = (window as any).__mapInstance;
            if (map) map.setZoom(map.getZoom() - 1);
          }}
          className="w-10 h-10 bg-white/90 rounded-lg flex items-center justify-center shadow-md hover:bg-white transition-colors"
          title="Zoom out"
        >
          <Minus className="w-5 h-5 text-gray-700" />
        </button>
      </div>

      {/* Use current location */}
      <button
        onClick={handleUseCurrentLocation}
        disabled={gettingLocation}
        className="absolute bottom-6 right-6 bg-white/90 px-5 py-3 rounded-full flex items-center gap-2 shadow-lg text-sm font-medium text-gray-700 hover:bg-white transition-colors disabled:opacity-60"
        title="Use current location"
      >
        {gettingLocation ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <LocateFixed className="w-5 h-5" />
        )}
        {gettingLocation ? 'Getting location...' : 'Use current location'}
      </button>

      {/* Address display */}
      <div className="absolute bottom-6 left-6 max-w-xs px-4 py-2 rounded-lg shadow-sm flex items-start gap-2 bg-white/90 backdrop-blur-sm">
        {loading && <Loader2 className="w-4 h-4 text-figma-accent animate-spin shrink-0 mt-0.5" />}
        {!loading && <span className="w-2 h-2 rounded-full bg-figma-accent shrink-0 mt-1" />}
        <span className="text-xs font-medium text-gray-700 line-clamp-2">
          {address || 'Loading address...'}
        </span>
      </div>
    </div>
  );
}
