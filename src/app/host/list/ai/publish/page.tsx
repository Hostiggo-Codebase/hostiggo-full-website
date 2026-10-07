'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Rocket, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import AiFlowShell from '../_components/AiFlowShell';
import {
  clearAiImportDraft,
  clearGeneratedListings,
  clearFailedImports,
  loadGeneratedListings,
  type AiGeneratedListing,
} from '../_lib/aiImportDraft';

type PublishResult = {
  sourceUrl: string;
  title: string;
  ok: boolean;
  error?: string;
};

// A host publishing via AI import hasn't gone through the manual wizard's
// property-type/stay-type steps -- map the source's type where we can, fall
// back to sensible defaults createListing accepts.
function toCreateListingPayload(userId: string, g: AiGeneratedListing) {
  return {
    userId,
    title: g.title,
    description: g.description,
    numGuests: g.numGuests,
    numBedrooms: g.numBedrooms,
    numBeds: g.numBeds,
    numBathrooms: g.numBathrooms,
    priceWeekday: g.priceWeekday,
    priceWeekend: g.priceWeekend || g.priceWeekday,
    photoUrls: g.photoUrls,
    amenityIds: g.amenityIds,
    latitude: g.latitude,
    longitude: g.longitude,
    locationId: g.locationId,
    addressLine1: g.addressLine1,
    city: g.city,
    state: g.state,
    postalCode: g.postalCode,
    propertyType: (g.propertyType || '').toLowerCase().trim() || 'apartment',
    stayType: g.stayType || 'entire',
    houseRules: g.houseRules,
    requireMinimumPhotos: true,
  };
}

export default function AiPublishPage() {
  const router = useRouter();
  const { userId, isAuthenticated } = useAuth();
  const [listings, setListings] = useState<AiGeneratedListing[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<PublishResult[] | null>(null);

  useEffect(() => {
    const loaded = loadGeneratedListings();
    if (loaded.length === 0) {
      // Nothing to publish (e.g. direct nav here without going through
      // Review) -- send them back to start.
      router.replace('/host/list/ai/setup');
      return;
    }
    setListings(loaded);
    setHydrated(true);
  }, [router]);

  if (!hydrated) return null;

  const isMulti = listings.length > 1;

  const handlePublish = async () => {
    if (!isAuthenticated || !userId) {
      toast('Please sign in to publish your listing.');
      router.push('/signin?redirect=/host/list/ai/publish');
      return;
    }

    // Check if user has a phone number
    try {
      const userResponse = await api.getUser(userId);
      if (!userResponse?.phone) {
        toast.error('Please add a phone number to your profile before publishing listings.');
        router.push('/host/settings?tab=personal');
        return;
      }
    } catch (err) {
      console.error('Failed to check user profile:', err);
    }

    setPublishing(true);
    const outcomes: PublishResult[] = [];
    // Sequential, not Promise.all -- keeps failures isolated to their own
    // listing and the UI's "publishing 2 of 4" progress meaningful, at the
    // cost of a slightly longer total wait for a large batch.
    for (const listing of listings) {
      try {
        await api.createListing(toCreateListingPayload(userId, listing));
        outcomes.push({ sourceUrl: listing.sourceUrl, title: listing.title, ok: true });
      } catch (err) {
        outcomes.push({
          sourceUrl: listing.sourceUrl,
          title: listing.title,
          ok: false,
          error: err instanceof Error ? err.message : 'Could not create the listing.',
        });
      }
    }
    setResults(outcomes);
    setPublishing(false);

    const successCount = outcomes.filter((o) => o.ok).length;
    if (successCount > 0) {
      clearAiImportDraft();
      clearGeneratedListings();
      clearFailedImports();
      toast.success(
        successCount === outcomes.length
          ? isMulti
            ? `${successCount} listings created!`
            : 'Listing created!'
          : `${successCount} of ${outcomes.length} listings created.`,
      );
    } else {
      toast.error('Could not publish any listings. Please try again.');
    }
  };

  if (results) {
    const successCount = results.filter((r) => r.ok).length;
    return (
      <AiFlowShell stage="publish" onBack={() => router.push('/host/list/ai/review')}>
        <div className="flex items-center justify-center py-16">
          <div className="bg-white rounded-3xl shadow-card border border-gray-200 max-w-md w-full p-10">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-figma-navy/10 flex items-center justify-center mx-auto mb-5">
                <Rocket className="w-8 h-8 text-figma-navy" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {successCount} of {results.length} published
              </h2>
              <p className="text-sm text-gray-500">
                Successful listings will appear on Hostiggo once approved.
              </p>
            </div>
            <div className="space-y-2 mb-6">
              {results.map((r) => (
                <div
                  key={r.sourceUrl}
                  className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ${
                    r.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
                  }`}
                >
                  {r.ok ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-semibold">{r.title}</p>
                    {!r.ok && <p className="text-xs opacity-90 mt-0.5">{r.error}</p>}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => router.push('/host/listings?created=1')}
              className="w-full py-3.5 bg-figma-navy hover:bg-figma-navy/90 text-white font-bold rounded-xl transition-all active:scale-[0.98]"
            >
              Go to my listings
            </button>
          </div>
        </div>
      </AiFlowShell>
    );
  }

  return (
    <AiFlowShell stage="publish" onBack={() => router.push('/host/list/ai/review')}>
      <div className="flex items-center justify-center py-16">
        <div className="bg-white rounded-3xl shadow-card border border-gray-200 max-w-md w-full p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-figma-navy/10 flex items-center justify-center mx-auto mb-5">
            <Rocket className="w-8 h-8 text-figma-navy" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Ready to publish</h2>
          {isMulti ? (
            <p className="text-sm text-gray-500 mb-6">
              <span className="font-semibold text-gray-800">{listings.length} listings</span> will
              be submitted for review. They&apos;ll appear on Hostiggo once approved.
            </p>
          ) : (
            <p className="text-sm text-gray-500 mb-6">
              <span className="font-semibold text-gray-800">{listings[0]?.title}</span> will be
              submitted for review. It&apos;ll appear on Hostiggo once approved.
            </p>
          )}
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="w-full py-3.5 bg-figma-navy hover:bg-figma-navy/90 text-white font-bold rounded-xl transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {publishing && <Loader2 className="w-4 h-4 animate-spin" />}
            {publishing
              ? isMulti
                ? 'Publishing…'
                : 'Publishing…'
              : isMulti
                ? `Publish ${listings.length} listings`
                : 'Publish listing'}
          </button>
        </div>
      </div>
    </AiFlowShell>
  );
}
