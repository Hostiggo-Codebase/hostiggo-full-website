'use client';

import { useEffect, useState } from 'react';
import { HelpCircle, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CATEGORIES, dbIdsFromStringIds, stringIdsFromDbIds } from '@/lib/amenityCatalog';
import { useListingDraft } from '@/context/ListingDraftContext';

export default function AmenitiesPage() {
  const router = useRouter();
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

  const handleNext = () => {
    router.push('/host/list/addons');
  };

  const handlePrev = () => {
    router.push('/host/list/capacity');
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-800">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 md:px-16 lg:px-20 h-20 bg-white shadow-sm border-b border-gray-100">
        <Link
          href="/"
          className="text-xl font-extrabold tracking-tight text-gray-900 flex items-center"
        >
          <span>HOSTI<span className="text-[#003B5C]">GGO</span></span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/host/listings"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            Save &amp; Exit
          </Link>
          <Link
            href="/support"
            className="text-[#003B5C] hover:bg-[#003B5C]/10 transition-colors p-2 rounded-full"
            aria-label="Help"
          >
            <HelpCircle className="w-5 h-5" />
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow pt-32 pb-32 px-6 md:px-16 lg:px-20 w-full max-w-4xl mx-auto flex flex-col items-start">
        <div className="bg-gray-800 text-white rounded-lg px-4 py-2 text-sm font-medium inline-block">
          Step 6/8 &gt;
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mt-6">
          Available facilities
        </h1>
        <p className="text-sm text-gray-500 mt-2 mb-8">
          Select amenities that your property offers, more amenities will appear after you publish your listing
        </p>

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
                      onClick={() => toggle(item.id)}
                      className={`w-36 h-24 p-4 relative flex flex-col justify-between rounded-xl border transition-all text-left ${
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
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 w-full z-50 bg-white flex flex-col shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        {/* Progress bar injected directly at the top edge */}
        <div className="w-full h-1 bg-gray-200">
          <div 
            className="h-full bg-[#003B5C] transition-all duration-500" 
            style={{ width: `${(6 / 8) * 100}%` }} 
          />
        </div>
        
        <div className="flex justify-between items-center px-6 md:px-16 lg:px-20 py-5">
          <button
            onClick={handlePrev}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-[#003B5C] text-[#003B5C] hover:bg-[#003B5C]/5 transition-all"
          >
            Previous
          </button>
          
          <div className="flex items-center gap-4">
            <Link
              href="/support"
              className="hidden md:block text-sm font-medium text-gray-500 hover:underline"
            >
              Need help?
            </Link>
            <button
              onClick={handleNext}
              className="px-8 py-2.5 rounded-xl text-sm font-bold bg-[#003B5C] text-white hover:bg-[#003B5C]/90 transition-all shadow-sm"
            >
              Next
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
