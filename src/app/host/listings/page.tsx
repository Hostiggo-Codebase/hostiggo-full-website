'use client';

import { formatINR } from '@/lib/format';
import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { toast } from 'sonner';
import { MapPin, Pencil, Plus, RotateCcw, Pause, Play } from 'lucide-react';
import HostDashboardShell, { DashboardHeading } from '../_components/HostDashboardShell';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import PayoutSetupBanner, { type PayoutBlocker } from '../_components/PayoutSetupBanner';

const FALLBACK_IMAGE = '/placeholder.svg';

type Listing = {
  id: string;
  name: string;
  location: string;
  price: number;
  image: string;
  active: boolean;
};

const coverImage = (row: any): string => {
  const media = Array.isArray(row?.listing_media) ? row.listing_media : [];
  const cover = media.find((m: any) => m?.is_cover)?.media_url;
  return cover || media[0]?.media_url || FALLBACK_IMAGE;
};

const mapListing = (row: any): Listing => {
  const loc = row?.locations ?? {};
  return {
    id: String(row.listing_id),
    name: row.title?.trim() || 'Untitled listing',
    location: [loc.district, loc.state].filter(Boolean).join(', ') || 'Location pending',
    price: Number(row.price_weekday ?? 0),
    image: coverImage(row),
    active: Boolean(row.is_active),
  };
};

const inr = (n: number) => formatINR(n);

function ListingSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden border border-gray-100">
      <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
      <div className="p-6 space-y-3">
        <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3" />
        <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
        <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
      </div>
    </div>
  );
}

export default function MyListingsPage() {
  const { userId } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<PayoutBlocker[]>([]);

  const PAGE_SIZE = 24;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    try {
      // First, ensure the user has a host profile
      // This is called when user first accesses /host/listings via "Host & Earn" button
      try {
        await fetch('/api/host/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      } catch (profileErr) {
        console.error('[host/listings] Failed to create/ensure host profile:', profileErr);
        // Don't fail if host profile creation fails, continue loading listings
      }

      const { data: rows, total: rowTotal } = await api.hostListings(userId, 0, PAGE_SIZE);
      setListings(rows.map(mapListing));
      setTotal(rowTotal);
      // Best-effort: the banner is guidance, the server enforces the rule.
      api
        .getPayoutReadiness()
        .then((r) => setBlockers(r.blockers))
        .catch(() => setBlockers([]));
    } catch (err) {
      console.error('[host/listings] load failed:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (!userId || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data: rows, total: rowTotal } = await api.hostListings(userId, listings.length, PAGE_SIZE);
      setListings((prev) => [...prev, ...rows.map(mapListing)]);
      setTotal(rowTotal);
    } catch (err) {
      console.error('[host/listings] load more failed:', err);
      toast.error('Could not load more listings.');
    } finally {
      setLoadingMore(false);
    }
  }, [userId, listings.length, loadingMore]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('created') === '1') {
      toast.success('Listing created!');
    }
  }, []);

  const handleToggleListing = async (listingId: string, currentActive: boolean) => {
    if (!userId) return;
    setTogglingId(listingId);
    try {
      const response = await fetch('/api/host/listings/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: parseInt(listingId),
          isActive: !currentActive,
          userId,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Failed to toggle listing');
      }

      const { data } = await response.json();
      
      // Update local state
      setListings((prev) =>
        prev.map((l) =>
          l.id === listingId ? { ...l, active: data.isActive } : l,
        ),
      );

      toast.success(data.isActive ? 'Listing is now live!' : 'Listing paused');
    } catch (err) {
      console.error('[toggle] Error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to toggle listing');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <HostDashboardShell active="listings">
      <DashboardHeading
        title="Your Listings"
        subtitle="Manage your properties, update availability, and maximize your earnings from one central dashboard."
        actions={
          <Link
            href="/host/list/method"
            className="flex items-center gap-2 bg-figma-navy text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-figma-navy/90 transition-all"
          >
            <Plus className="w-5 h-5" />
            New listing
          </Link>
        }
      />

      {!loading && !error && <PayoutSetupBanner blockers={blockers} />}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <ListingSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card py-16 px-6 text-center">
          <p className="text-4xl mb-3">😕</p>
          <h2 className="text-lg font-bold text-gray-800 mb-1">Couldn&apos;t load your listings</h2>
          <p className="text-sm text-gray-500 mb-6">Something went wrong. Please try again.</p>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 bg-figma-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-figma-navy/90 transition-all"
          >
            <RotateCcw className="w-4 h-4" /> Try again
          </button>
        </div>
      ) : listings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card py-16 px-6 text-center">
          <p className="text-4xl mb-3">🏠</p>
          <h2 className="text-lg font-bold text-gray-800 mb-1">No listings yet</h2>
          <p className="text-sm text-gray-500 mb-6">
            Create your first listing to start hosting and earning.
          </p>
          <Link
            href="/host/list/method"
            className="inline-flex items-center gap-2 bg-figma-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-figma-navy/90 transition-all"
          >
            <Plus className="w-4 h-4" /> Create a listing
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-400 mb-4">
            Showing {listings.length} of {total} listings
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {listings.map((l) => (
              <article
                key={l.id}
                className={cn(
                  'group relative bg-white rounded-2xl shadow-card overflow-hidden border border-gray-100 hover:shadow-card-hover transition-all duration-300',
                  !l.active && 'opacity-80 hover:opacity-100',
                )}
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    fill
                    src={l.image}
                    alt={l.name}
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (img.src !== FALLBACK_IMAGE) img.src = FALLBACK_IMAGE;
                    }}
                    className={cn(
                      'object-cover transition-all duration-500',
                      !l.active && 'grayscale group-hover:grayscale-0',
                    )}
                  />
                  <div className="absolute top-4 left-4 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
                    <span
                      className={cn('w-2 h-2 rounded-full', l.active ? 'bg-green-500' : 'bg-gray-400')}
                    />
                    <span className="text-xs font-semibold text-gray-700">
                      {l.active ? 'Live' : blockers.length > 0 ? 'Not live yet' : 'Paused'}
                    </span>
                  </div>
                  <div className="absolute inset-0 bg-figma-navy/20 flex flex-col items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <Link
                      href={`/host/listings/manage?id=${l.id}`}
                      className="bg-white text-figma-navy px-6 py-3 rounded-xl font-bold shadow-lg translate-y-4 group-hover:translate-y-0 transition-transform duration-300 flex items-center gap-2"
                    >
                      <Pencil className="w-5 h-5" />
                      Edit
                    </Link>
                    <button
                      onClick={() => handleToggleListing(l.id, l.active)}
                      disabled={togglingId === l.id}
                      className={cn(
                        'px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all',
                        l.active
                          ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                          : 'bg-green-500 text-white hover:bg-green-600',
                        togglingId === l.id && 'opacity-60 cursor-not-allowed',
                      )}
                    >
                      {togglingId === l.id ? (
                        <span className="inline-block animate-spin">⟳</span>
                      ) : l.active ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      {l.active ? 'Pause' : blockers.length > 0 ? 'Go live' : 'Reactivate'}
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex justify-between items-start mb-2 gap-3">
                    <h3 className="text-lg font-bold text-gray-800 truncate">{l.name}</h3>
                    <span className="text-lg font-bold text-figma-navy whitespace-nowrap">
                      {inr(l.price)}
                      <span className="text-sm text-gray-400 font-normal">/nt</span>
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span className="truncate">{l.location}</span>
                  </p>
                </div>
              </article>
            ))}
          </div>
          {listings.length < total && (
            <div className="flex justify-center mt-8">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-card"
              >
                {loadingMore ? 'Loading…' : `Load more (${total - listings.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </HostDashboardShell>
  );
}
