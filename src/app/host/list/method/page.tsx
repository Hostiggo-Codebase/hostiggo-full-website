'use client';

import { useRouter } from 'next/navigation';
import { Sparkles, PenSquare, ChevronRight, Check } from 'lucide-react';
import AiFlowShell from '../ai/_components/AiFlowShell';
import { clearAiImportDraft, clearGeneratedListings, clearFailedImports } from '../ai/_lib/aiImportDraft';

export default function ListingMethodPage() {
  const router = useRouter();

  const startAiFlow = () => {
    // Fresh run each time this gate is entered, so an abandoned AI import
    // from a previous visit doesn't resurface here.
    clearAiImportDraft();
    clearGeneratedListings();
    clearFailedImports();
    router.push('/host/list/ai/setup');
  };

  return (
    <AiFlowShell stage="method" showBack={false}>
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3">
        How would you like to create your listing?
      </h1>
      <p className="text-gray-600 text-lg mb-10 max-w-2xl">
        Choose a method that works best for you. Our AI can import and enhance your existing
        listings automatically.
      </p>

      <div className="grid md:grid-cols-2 gap-6 items-stretch">
        {/* List with AI */}
        <button
          type="button"
          onClick={startAiFlow}
          className="relative text-left rounded-3xl p-5 sm:p-8 bg-gradient-to-br from-figma-navy to-[#0B6FA8] text-white shadow-xl hover:-translate-y-1 transition-transform overflow-hidden flex flex-col"
        >
          <span className="absolute top-5 right-5 text-[11px] font-bold uppercase tracking-wide bg-white/20 rounded-full px-3 py-1">
            Recommended
          </span>
          <Sparkles className="w-8 h-8 mb-4" />
          <h2 className="text-2xl font-bold mb-4">List with AI</h2>
          <ul className="space-y-3 mb-8 flex-1">
            {[
              'Import from Airbnb, Agoda, or any other platform if you are host there',
              'Our AI automatically generates an optimized listing with photos, description, and amenities',
              'Easy and simple to do',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-white/90">
                <Check className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <span className="inline-flex items-center gap-1 font-bold">
            Get started <ChevronRight className="w-4 h-4" />
          </span>
        </button>

        {/* List Manually */}
        <button
          type="button"
          onClick={() => router.push('/host/list/property-type')}
          className="text-left rounded-3xl p-5 sm:p-8 bg-white border border-gray-200 shadow-card hover:-translate-y-1 transition-transform flex flex-col"
        >
          <div className="w-11 h-11 rounded-xl bg-figma-navy/10 flex items-center justify-center text-figma-navy mb-4">
            <PenSquare className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">List Manually</h2>
          <ul className="space-y-3 mb-8 flex-1">
            {[
              'Manually list your property',
              'Full control over content',
              'Step-by-step guided form',
              'Custom photos & media',
              'Flexible pricing setup',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-gray-600">
                <Check className="w-4 h-4 mt-0.5 shrink-0 text-figma-navy" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <span className="inline-flex items-center gap-1 font-bold text-figma-navy">
            Create manually <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      </div>
    </AiFlowShell>
  );
}
