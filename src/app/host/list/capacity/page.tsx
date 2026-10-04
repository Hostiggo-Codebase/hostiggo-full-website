'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus, Sparkles } from 'lucide-react';
import WizardShell from '../_components/WizardShell';
import { useListingDraft } from '@/context/ListingDraftContext';

const ROWS = [
  { key: 'guests', label: 'Guests', desc: 'Max number of people', initial: 4, min: 1, max: 50 },
  { key: 'bedrooms', label: 'Bedrooms', desc: 'Private spaces for guests', initial: 2, min: 0, max: 50 },
  { key: 'beds', label: 'Beds', desc: 'Total sleeping spots', initial: 3, min: 1, max: 50 },
  { key: 'bathrooms', label: 'Bathrooms', desc: 'Full or half bathrooms', initial: 1, min: 0, max: 50 },
] as const;

export default function CapacityPage() {
  const { draft, update } = useListingDraft();
  const [counts, setCounts] = useState<Record<string, number>>(() => ({
    guests: draft.numGuests ?? 4,
    bedrooms: draft.numBedrooms ?? 2,
    beds: draft.numBeds ?? 3,
    bathrooms: draft.numBathrooms ?? 1,
  }));

  useEffect(() => {
    update({
      numGuests: counts.guests,
      numBedrooms: counts.bedrooms,
      numBeds: counts.beds,
      numBathrooms: counts.bathrooms,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts]);

  const set = (key: string, delta: number, min: number, max: number) =>
    setCounts((c) => ({ ...c, [key]: Math.min(max, Math.max(min, c[key] + delta)) }));

  return (
    <WizardShell
      step={5}
      title="Share some basics about your place"
      subtitle="You'll add more details later, like amenities and photos. For now, let's start with the essentials."
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Left: context + inspiration */}
        <div className="md:col-span-5 space-y-6">
          <div className="relative w-full aspect-video rounded-3xl overflow-hidden shadow-card">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage:
                  "url('/images/empty-states/sample-bedroom.jpg')",
              }}
            />
            <div className="absolute bottom-4 left-4 px-4 py-2 rounded-full flex items-center gap-2 bg-white/80 backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-figma-navy" />
              <span className="text-xs font-semibold text-figma-navy">
                High-visibility listing tips
              </span>
            </div>
          </div>
        </div>

        {/* Right: counters */}
        <div className="md:col-span-7 flex md:justify-end">
          <div className="w-full max-w-lg bg-white p-8 md:p-10 rounded-3xl shadow-card border border-gray-200">
            <div className="space-y-6">
              {ROWS.map((row, i) => (
                <div
                  key={row.key}
                  className={
                    i < ROWS.length - 1
                      ? 'flex items-center justify-between pb-6 border-b border-gray-100'
                      : 'flex items-center justify-between'
                  }
                >
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">
                      {row.label}
                    </h3>
                    <p className="text-sm text-gray-500">{row.desc}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => set(row.key, -1, row.min, row.max)}
                      className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-all text-figma-navy disabled:opacity-40"
                      disabled={counts[row.key] <= row.min}
                      aria-label={`Decrease ${row.label}`}
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <span className="text-lg font-bold w-6 text-center text-gray-800">
                      {counts[row.key]}
                    </span>
                    <button
                      onClick={() => set(row.key, 1, row.min, row.max)}
                      disabled={counts[row.key] >= row.max}
                      className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-all text-figma-navy disabled:opacity-40"
                      aria-label={`Increase ${row.label}`}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </WizardShell>
  );
}
