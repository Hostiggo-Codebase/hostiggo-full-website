'use client';

import { useEffect, useMemo, useState } from 'react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Star, Search, Loader2 } from 'lucide-react';
import HostDashboardShell, { DashboardHeading } from '../_components/HostDashboardShell';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  reviewedAt: string;
  listingTitle: string;
  reviewerName: string;
  reviewerAvatar: string | null;
};

const TABS = ['All Reviews', 'Recent first', 'Highest ratings', 'Lowest ratings'];

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'w-4 h-4',
            i < n ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200',
          )}
        />
      ))}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function ReviewsPage() {
  const { userId } = useAuth();
  const [tab, setTab] = useState(TABS[0]);
  const [query, setQuery] = useState('');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    setLoading(true);
    setError(false);
    api
      .hostReviews(userId)
      .then((rows) => {
        if (mounted) setReviews(rows as Review[]);
      })
      .catch((err) => {
        console.error('[host/reviews] load failed:', err);
        if (mounted) setError(true);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [userId]);

  const overallRating = useMemo(() => {
    if (reviews.length === 0) return null;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return sum / reviews.length;
  }, [reviews]);

  const distribution = useMemo(() => {
    const counts = [5, 4, 3, 2, 1].map((star) => ({
      label: `${star} star${star > 1 ? 's' : ''}`,
      count: reviews.filter((r) => r.rating === star).length,
    }));
    return counts.map((c) => ({
      ...c,
      pct: reviews.length ? Math.round((c.count / reviews.length) * 100) : 0,
    }));
  }, [reviews]);

  const filtered = useMemo(() => {
    let list = [...reviews];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.reviewerName.toLowerCase().includes(q) ||
          r.listingTitle.toLowerCase().includes(q) ||
          (r.comment ?? '').toLowerCase().includes(q),
      );
    }
    if (tab === 'Highest ratings') list.sort((a, b) => b.rating - a.rating);
    else if (tab === 'Lowest ratings') list.sort((a, b) => a.rating - b.rating);
    else list.sort((a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime());
    return list;
  }, [reviews, query, tab]);

  return (
    <HostDashboardShell active="reviews">
      <DashboardHeading
        title="Guest Feedback"
        subtitle="See what guests say about your properties."
      />

      {loading ? (
        <div className="bg-white rounded-3xl p-16 shadow-card border border-gray-200 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-3xl p-16 shadow-card border border-gray-200 text-center">
          <p className="text-4xl mb-3">😕</p>
          <p className="text-gray-500">Couldn&apos;t load your reviews. Please try again.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
            <div className="lg:col-span-4 bg-white rounded-3xl p-8 shadow-card border border-gray-200 flex flex-col items-center justify-center text-center">
              <p className="text-xs text-gray-500 uppercase tracking-[0.2em] mb-4">
                Overall Rating
              </p>
              <h2 className="text-6xl font-bold text-gray-900 leading-none mb-3">
                {overallRating !== null ? overallRating.toFixed(1) : 'N/A'}
              </h2>
              <Stars n={overallRating !== null ? Math.round(overallRating) : 0} />
              <p className="text-sm text-gray-500 mt-3">
                Based on {reviews.length} review{reviews.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="lg:col-span-8 bg-white rounded-3xl p-8 shadow-card border border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-[0.2em] mb-6">
                Rating Distribution
              </p>
              <div className="space-y-4">
                {distribution.map((d) => (
                  <div key={d.label} className="flex items-center gap-4">
                    <span className="text-sm text-gray-800 w-12 text-right">{d.label}</span>
                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-figma-navy rounded-full"
                        style={{ width: `${d.pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500 w-10">{d.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-gray-200 pb-4 mb-6">
            <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl w-full lg:w-fit overflow-x-auto scrollbar-hide">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'px-5 py-2 rounded-xl text-sm whitespace-nowrap transition-all',
                    tab === t
                      ? 'bg-white shadow-sm font-bold text-figma-navy'
                      : 'font-medium text-gray-500 hover:bg-gray-200',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="relative w-full lg:w-80">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or content"
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="bg-white rounded-3xl p-16 shadow-card border border-gray-200 text-center">
              <p className="text-4xl mb-3">⭐</p>
              <p className="text-gray-500">
                {reviews.length === 0
                  ? "No reviews yet. They'll show up here once guests review a completed stay."
                  : 'No reviews match your search.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="bg-white rounded-3xl p-6 md:p-8 shadow-card border border-gray-100"
                >
                  <div className="flex flex-col md:flex-row gap-6">
                    <UserAvatar
                      src={r.reviewerAvatar}
                      name={r.reviewerName}
                      size={64}
                      className="rounded-2xl border-2 border-gray-100"
                    />
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-800">{r.reviewerName}</h3>
                          <p className="text-sm text-gray-500">
                            Reviewed {fmtDate(r.reviewedAt)} •{' '}
                            <span className="font-semibold text-figma-navy">{r.listingTitle}</span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end">
                          <Stars n={r.rating} />
                        </div>
                      </div>
                      {r.comment && (
                        <p className="text-sm text-gray-700 leading-relaxed">{r.comment}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </HostDashboardShell>
  );
}
