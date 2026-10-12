'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import WizardShell from '../_components/WizardShell';
import { CATEGORIES, dbIdsFromStringIds, stringIdsFromDbIds } from '@/lib/amenityCatalog';
import { useListingDraft } from '@/context/ListingDraftContext';

export default function AmenitiesPage() {
  const { draft, update } = useListingDraft();
  
  const [selected, setSelected] = useState<Set<string>>(() => {
    const fromDraft = stringIdsFromDbIds(draft.amenityIds);
    return fromDraft.size > 0 ? fromDraft : new Set(['wifi', 'kitchen']);
  });

  useEffect(() => {
    update({ amenityIds: dbIdsFromStringIds(selected) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <WizardShell
      step={6}
      title="Available facilities"
      subtitle="Select the amenities your property offers. You can update these anytime after publishing."
    >
        <div className="w-full pb-10">
          {CATEGORIES.map((category) => (
            <div key={category.title} className="mb-8">
              <h2 className="text-lg font-bold text-gray-800 mt-8 mb-4">
                {category.title}
              </h2>
              
              <div className="flex flex-wrap gap-4">
                {category.items.map((item) => {
                  const Icon = item.icon;
                  const isSelected = selected.has(item.id);
                  
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggle(item.id)}
                      className={`w-[calc(50%-0.5rem)] sm:w-36 h-24 p-4 relative flex flex-col justify-between rounded-xl border transition-all text-left ${
                        isSelected 
                          ? 'border-[#003B5C] bg-white text-[#003B5C] shadow-sm ring-1 ring-[#003B5C]' 
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="text-sm font-medium leading-tight">{item.label}</span>
                      
                      {isSelected && (
                        <Check 
                          className="w-5 h-5 text-[#003B5C] absolute top-3 right-3" 
                          strokeWidth={3} 
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
    </WizardShell>
  );
}
