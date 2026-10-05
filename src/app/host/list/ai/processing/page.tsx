'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import AiFlowShell from '../_components/AiFlowShell';
import {
  loadAiImportDraft,
  saveGeneratedListings,
  saveFailedImports,
  type AiGeneratedListing,
  type FailedImport,
} from '../_lib/aiImportDraft';
import { api } from '@/lib/api';
import { matchAmenityNames } from '@/lib/services/amenityMatch';
import { resolveLocationId } from '@/lib/services/geocoding';

type Outcome = 'loading' | 'success' | 'failure';

// A job whose status is still 'queued'/'processing' after this many polls
// (~1.5s apart) is treated as failed rather than polled forever.
const MAX_POLLS = 30;
const POLL_INTERVAL_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Maps a real AI-lister job result onto this flow's AiGeneratedListing shape. */
async function runRealImport(
  url: string,
  onPhase?: (phase: 'importing' | 'photos') => void,
): Promise<{ ok: true; listing: AiGeneratedListing } | { ok: false; error: string }> {
  const createRes = await fetch('/api/host/ai-import/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const createBody = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    return { ok: false, error: createBody?.error || 'Could not start the import.' };
  }

  let job = createBody.data;
  let polls = 0;
  while ((job.status === 'queued' || job.status === 'processing') && polls < MAX_POLLS) {
    await sleep(POLL_INTERVAL_MS);
    const pollRes = await fetch(`/api/host/ai-import/jobs/${job.id}`);
    const pollBody = await pollRes.json().catch(() => ({}));
    if (!pollRes.ok) {
      return { ok: false, error: pollBody?.error || 'Lost track of the import job.' };
    }
    job = pollBody.data;
    polls += 1;
  }

  if (job.status !== 'succeeded' || !job.validated_draft) {
    return { ok: false, error: job.error || 'The source page could not be processed.' };
  }

  const draft = job.validated_draft;
  const successfulPhotos = (job.photos ?? []).filter((p: any) => p.public_url);
  const amenityLabels: string[] = Array.isArray(draft.amenities) ? draft.amenities : [];

  // Fuzzy-match the source site's free-text amenities onto our amenity_id
  // enum, and resolve the scraped city to a curated location_id. Both are
  // best-effort -- the host confirms/adjusts them in the review screen.
  let amenityIds: number[] = [];
  try {
    const catalog = await api.amenities();
    amenityIds = matchAmenityNames(amenityLabels, catalog);
  } catch (e) {
    console.error('[ai-import] amenity match failed:', e);
  }

  let locationId: number | undefined;
  try {
    locationId = await resolveLocationId(draft.address?.city ?? undefined, draft.address?.state ?? undefined);
  } catch (e) {
    console.error('[ai-import] location resolve failed:', e);
  }

  // Copy the upstream-hosted photos into our own bucket before the review
  // screen renders them (the source URLs aren't on an allow-listed image
  // host and would break if that service purges its storage).
  let photoUrls: string[] = [];
  const sourceUrls = successfulPhotos.map((p: any) => p.public_url as string);
  if (sourceUrls.length) {
    onPhase?.('photos');
    try {
      const rehostRes = await fetch('/api/host/ai-import/rehost-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: sourceUrls }),
      });
      const rehostBody = await rehostRes.json().catch(() => ({}));
      if (rehostRes.ok && Array.isArray(rehostBody?.data?.urls)) {
        photoUrls = (rehostBody.data.urls as (string | null)[]).filter(
          (u): u is string => typeof u === 'string',
        );
      }
    } catch (e) {
      console.error('[ai-import] photo re-host failed:', e);
    }
  }

  // The AI-lister backend (github.com/Hostiggo-Codebase/AI-lister, Railway)
  // can return the literal string "<UNKNOWN>" for a field it couldn't
  // extract, instead of null/empty -- observed on a syntactically-valid but
  // non-existent source URL. `draft.title || 'Untitled listing'` alone only
  // catches a falsy (null/empty) title, so that sentinel string was leaking
  // straight into the review form's "Listing Title" fields verbatim. Treat
  // it the same as an empty title here, at the boundary where we read the
  // external response, rather than needing every field consumer downstream
  // to know about this backend's sentinel.
  const isUnknownSentinel = (v: string | null | undefined) =>
    !v || v.trim().toUpperCase() === '<UNKNOWN>';

  return {
    ok: true,
    listing: {
      sourceUrl: url,
      title: draft.title || 'Untitled listing',
      description: draft.description || '',
      numGuests: draft.capacity?.max_guests ?? 2,
      numBedrooms: draft.capacity?.bedrooms ?? 1,
      numBeds: draft.capacity?.beds ?? 1,
      numBathrooms: draft.capacity?.bathrooms ?? 1,
      amenityIds,
      amenityLabels,
      priceWeekday: draft.pricing?.nightly_amount ?? 0,
      priceWeekend: draft.pricing?.nightly_amount ?? 0,
      photosImported: photoUrls.length,
      amenitiesFound: amenityLabels.length,
      aiScore: job.coverage?.summary?.percent_prefilled ?? 0,
      photoUrls,
      latitude: draft.location?.lat ?? undefined,
      longitude: draft.location?.lng ?? undefined,
      locationId,
      addressLine1: draft.address?.line ?? undefined,
      city: draft.address?.city ?? undefined,
      state: draft.address?.state ?? undefined,
      postalCode: draft.address?.postal_code ?? undefined,
      country: draft.address?.country ?? undefined,
      propertyType: draft.property_type ?? undefined,
      roomType: draft.room_type ?? undefined,
      stayType: 'entire',
      houseRules: {
        check_in_time: '15:00',
        check_out_time: '11:00',
        smoking_allowed: false,
        pets_allowed: false,
        parties_allowed: false,
        quiet_hours: true,
      },
    },
  };
}

type AggregateStats = {
  photosImported: number;
  amenitiesFound: number;
  aiScore: number;
  successCount: number;
  failureCount: number;
  totalCount: number;
};

function ProcessingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Debug-only affordance to view the failure state on demand:
  // /host/list/ai/processing?fail=1
  const forceFail = searchParams?.get('fail') === '1';

  const [outcome, setOutcome] = useState<Outcome>('loading');
  const [phase, setPhase] = useState<'importing' | 'photos'>('importing');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [attempt, setAttempt] = useState(0);

  const run = useCallback(async () => {
    setOutcome('loading');
    setPhase('importing');
    const draft = loadAiImportDraft();
    const urls = draft.listings
      .map((l) => l.airbnbUrl.trim())
      .filter((u) => u.length > 0);

    if (forceFail || urls.length === 0) {
      setErrorMessage('No source URL was provided.');
      setOutcome('failure');
      return;
    }

    // Sequential, not parallel -- this hits the same AI-lister backend
    // (Anthropic + photo re-hosting) for each URL, and running N of these
    // concurrently risks rate limits / cross-job interference for no real
    // speed benefit the host would notice on a handful of listings.
    const succeeded: AiGeneratedListing[] = [];
    const failed: FailedImport[] = [];
    for (let i = 0; i < urls.length; i++) {
      setProgress({ current: i + 1, total: urls.length });
      const result = await runRealImport(urls[i], setPhase);
      if (result.ok) {
        succeeded.push(result.listing);
      } else {
        failed.push({ sourceUrl: urls[i], error: result.error });
      }
    }

    saveGeneratedListings(succeeded);
    saveFailedImports(failed);

    if (succeeded.length === 0) {
      setErrorMessage(failed[0]?.error || 'The source page could not be processed.');
      setOutcome('failure');
      return;
    }

    setStats({
      photosImported: succeeded.reduce((sum, l) => sum + l.photosImported, 0),
      amenitiesFound: succeeded.reduce((sum, l) => sum + l.amenitiesFound, 0),
      aiScore: Math.round(succeeded.reduce((sum, l) => sum + l.aiScore, 0) / succeeded.length),
      successCount: succeeded.length,
      failureCount: failed.length,
      totalCount: urls.length,
    });
    setOutcome('success');
  }, [forceFail]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <AiFlowShell stage="processing" showBack={false}>
      <div className="flex items-center justify-center py-16">
        <div className="bg-white rounded-3xl shadow-card border border-gray-200 max-w-md w-full p-10 text-center">
          {outcome === 'loading' && (
            <>
              <Loader2 className="w-12 h-12 text-figma-navy animate-spin mx-auto mb-6" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {phase === 'photos' ? 'Saving photos to your library…' : 'Generating your listing…'}
              </h2>
              <p className="text-sm text-gray-500">
                {progress.total > 1
                  ? `Processing listing ${progress.current} of ${progress.total}. `
                  : ''}
                {phase === 'photos'
                  ? 'Copying the imported photos into your Hostiggo account so they stay put.'
                  : 'Our AI is reading the listing, importing photos, and detecting amenities. This usually takes under a minute.'}
              </p>
            </>
          )}

          {outcome === 'success' && stats && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {stats.totalCount > 1 ? 'Your listings are ready!' : 'Your listing is ready!'}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {stats.totalCount > 1
                  ? `The AI successfully generated ${stats.successCount} of ${stats.totalCount} listings. Review each one before publishing.`
                  : 'The AI has successfully generated your property listing. Review all the details before publishing.'}
              </p>
              {stats.failureCount > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 text-xs text-amber-700 font-medium mb-6 text-left">
                  {stats.failureCount} of {stats.totalCount} listing{stats.failureCount > 1 ? 's' : ''}{' '}
                  could not be imported. You can add {stats.failureCount > 1 ? 'them' : 'it'} manually later.
                </div>
              )}
              <div className="grid grid-cols-3 gap-3 mb-8">
                <div>
                  <p className="text-2xl font-extrabold text-gray-900">{stats.photosImported}</p>
                  <p className="text-xs text-gray-500">Photos imported</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-gray-900">{stats.amenitiesFound}</p>
                  <p className="text-xs text-gray-500">Amenities found</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-gray-900">{stats.aiScore}%</p>
                  <p className="text-xs text-gray-500">Avg. AI score</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/host/list/ai/review')}
                className="w-full py-3.5 bg-figma-navy hover:bg-figma-navy/90 text-white font-bold rounded-xl transition-all active:scale-[0.98] inline-flex items-center justify-center gap-1.5"
              >
                Review Listings →
              </button>
              <p className="text-xs text-gray-400 mt-3">
                You can edit any details before publishing.
              </p>
            </>
          )}

          {outcome === 'failure' && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Generation Failed</h2>
              <p className="text-sm text-gray-500 mb-4">
                We could not process your listing. The source URL may be invalid or the platform
                is temporarily unavailable.
              </p>
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 text-xs text-red-600 font-medium mb-6">
                Error: {errorMessage}
              </div>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="w-full py-3.5 bg-figma-navy hover:bg-figma-navy/90 text-white font-bold rounded-xl transition-all active:scale-[0.98] mb-3"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="text-sm font-bold text-figma-navy hover:underline"
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </AiFlowShell>
  );
}

export default function AiProcessingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FFFEF9]" />}>
      <ProcessingContent />
    </Suspense>
  );
}
