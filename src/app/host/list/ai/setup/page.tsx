'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Plus, Sparkles, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import AiFlowShell from '../_components/AiFlowShell';
import {
  type AiImportDraft,
  type AiListingImport,
  emptyImport,
  loadAiImportDraft,
  saveAiImportDraft,
} from '../_lib/aiImportDraft';

const MAX_LISTINGS = 10;

export default function AiSetupPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<AiImportDraft>({ listings: [emptyImport()], multiMode: false });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDraft(loadAiImportDraft());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveAiImportDraft(draft);
  }, [draft, hydrated]);

  const updateListing = (idx: number, patch: Partial<AiListingImport>) => {
    setDraft((d) => ({
      ...d,
      listings: d.listings.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  };

  const addListing = () => {
    setDraft((d) =>
      d.listings.length >= MAX_LISTINGS
        ? d
        : { ...d, multiMode: true, listings: [...d.listings, emptyImport()] },
    );
  };

  const removeListing = (idx: number) => {
    setDraft((d) => {
      const listings = d.listings.filter((_, i) => i !== idx);
      return { ...d, listings: listings.length ? listings : [emptyImport()] };
    });
  };

  const canGenerate = draft.listings.some((l) => l.airbnbUrl.trim().length > 0);

  const handleGenerate = () => {
    if (!canGenerate) return;
    saveAiImportDraft(draft);
    router.push('/host/list/ai/processing');
  };

  return (
    <AiFlowShell stage="setup" onBack={() => router.push('/host/list/method')}>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">
        {draft.multiMode ? 'Add multiple listings' : 'Import your existing listing'}
      </h1>
      <p className="text-gray-600 mb-8 max-w-2xl">
        {draft.multiMode
          ? `Import up to ${MAX_LISTINGS} properties at once. Each property gets its own AI-generated listing.`
          : 'Paste your Airbnb or Agoda listing URL and our AI will automatically extract all property details, photos, amenities, and more.'}
      </p>

      <div className="grid md:grid-cols-[1fr_280px] gap-8">
        <div className="space-y-6">
          {draft.listings.map((listing, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden"
            >
              {draft.multiMode && (
                <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b border-gray-100">
                  <span className="text-sm font-bold text-gray-800">Listing {idx + 1}</span>
                  {draft.listings.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeListing(idx)}
                      aria-label={`Remove listing ${idx + 1}`}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              <div className="p-6 space-y-5">
                {!draft.multiMode && (
                  <div className="rounded-2xl p-5 bg-gradient-to-br from-figma-navy to-[#0B6FA8] text-white flex gap-3">
                    <Sparkles className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold mb-1">How AI listing works</p>
                      <p className="text-sm text-white/90">
                        Paste your existing listing link below. Our AI reads the title, photos,
                        amenities, and description — then builds your complete listing
                        automatically.
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">
                    Source Link
                  </p>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Airbnb or Agoda Listing URL<span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3.5 py-3 focus-within:border-figma-navy focus-within:ring-1 focus-within:ring-figma-navy transition-all">
                    <Link2 className="w-4 h-4 text-gray-400 shrink-0" />
                    <input
                      type="url"
                      value={listing.airbnbUrl}
                      onChange={(e) => updateListing(idx, { airbnbUrl: e.target.value })}
                      placeholder="Example - airbnb.com/rooms/12345678"
                      className="flex-1 outline-none text-sm text-gray-900 placeholder:text-gray-400"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      AI Options
                    </p>
                    <span className="text-[11px] font-semibold text-gray-400">Optional</span>
                  </div>
                  {(['importAllPhotosA', 'importAllPhotosB'] as const).map((field) => (
                    <div
                      key={field}
                      className="flex items-center justify-between py-3 border-t border-gray-100 first:border-t-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Import all photos</p>
                        <p className="text-xs text-gray-500">Pull photos directly from source</p>
                      </div>
                      <Switch
                        checked={listing[field]}
                        onCheckedChange={(v) => updateListing(idx, { [field]: v })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addListing}
            disabled={draft.listings.length >= MAX_LISTINGS}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-figma-navy border border-dashed border-figma-navy/40 rounded-xl px-4 py-2.5 hover:bg-figma-navy/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Add Another
          </button>
        </div>

        {draft.multiMode && (
          <aside className="hidden md:block">
            <div className="rounded-2xl p-5 bg-gradient-to-br from-figma-navy to-[#0B6FA8] text-white flex gap-3 sticky top-6">
              <Sparkles className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">How AI listing works</p>
                <p className="text-sm text-white/90">
                  Paste your existing listing link below. Our AI reads the title, photos,
                  amenities, and description — then builds your complete listing automatically.
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Sticky footer nav, matching the manual wizard's footer pattern */}
      <div className="fixed bottom-0 left-0 w-full z-50 flex justify-between items-center px-4 sm:px-6 md:px-16 lg:px-20 py-3 sm:py-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white border-t border-gray-200 shadow-lg">
        <button
          type="button"
          onClick={() => router.push('/host/list/method')}
          className="px-5 sm:px-6 py-3 sm:py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all active:scale-95"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="rounded-lg px-6 sm:px-8 py-3 sm:py-2.5 text-sm font-bold text-white transition-all active:scale-95 shadow-sm bg-figma-navy hover:bg-figma-navy/90 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Generate Listing
        </button>
      </div>
      <div className="h-20" />
    </AiFlowShell>
  );
}
