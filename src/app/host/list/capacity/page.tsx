'use client';

import { useEffect, useState } from 'react';
import { HelpCircle, Minus, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useListingDraft } from '@/context/ListingDraftContext';

export default function CapacityPage() {
  const router = useRouter();
  const { draft, update } = useListingDraft();
  
  const [bedrooms, setBedrooms] = useState<{guests: number, beds: number, bathrooms: number}[]>(() => {
    const num = Math.max(1, draft.numBedrooms ?? 1);
    const initialBeds = [];
    for (let i = 0; i < num; i++) {
      if (i === 0) {
        initialBeds.push({
          guests: draft.numGuests ?? 4,
          beds: draft.numBeds ?? 3,
          bathrooms: draft.numBathrooms ?? 1,
        });
      } else {
        initialBeds.push({ guests: 1, beds: 1, bathrooms: 0 });
      }
    }
    return initialBeds;
  });

  useEffect(() => {
    const totals = bedrooms.reduce(
      (acc, curr) => ({
        guests: acc.guests + curr.guests,
        beds: acc.beds + curr.beds,
        bathrooms: acc.bathrooms + curr.bathrooms,
      }),
      { guests: 0, beds: 0, bathrooms: 0 }
    );

    update({
      numBedrooms: bedrooms.length,
      numGuests: totals.guests,
      numBeds: totals.beds,
      numBathrooms: totals.bathrooms,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bedrooms]);

  const updateBedroom = (index: number, key: 'guests' | 'beds' | 'bathrooms', delta: number, min: number) => {
    setBedrooms(prev => {
      const next = [...prev];
      const current = next[index][key];
      next[index] = { ...next[index], [key]: Math.max(min, current + delta) };
      return next;
    });
  };

  const addBedroom = () => {
    setBedrooms(prev => [...prev, { guests: 2, beds: 1, bathrooms: 1 }]);
  };

  const removeBedroom = (index: number) => {
    setBedrooms(prev => prev.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    router.push('/host/list/amenities');
  };

  const handlePrev = () => {
    router.push('/host/list/address');
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
          Step 5/8 &gt;
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mt-6">
          Property Capacity
        </h1>
        <p className="text-sm text-gray-500 mt-2 mb-8">
          Tell us how many bedrooms you have and there maximum capacity of guests, beds and bathrooms.
        </p>

        <div className="space-y-6 w-full">
          {bedrooms.map((bedroom, index) => (
            <div key={index} className="w-full">
              <h2 className="text-lg font-bold text-gray-800 mb-3">Bedroom {index + 1}</h2>
              <div className="bg-white rounded-xl border border-gray-200 p-6 relative max-w-md shadow-sm">
                {index > 0 && (
                  <button 
                    onClick={() => removeBedroom(index)}
                    className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow-md cursor-pointer hover:bg-red-600 transition-colors"
                    aria-label="Remove bedroom"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                
                <div className="space-y-6">
                  {/* Max Guests */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-800 font-medium">Max Guests</span>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => updateBedroom(index, 'guests', -1, 1)}
                        disabled={bedroom.guests <= 1}
                        className="bg-[#003B5C] text-white rounded-full w-7 h-7 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#002b43] transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-4 text-center font-semibold text-gray-800">{bedroom.guests}</span>
                      <button 
                        onClick={() => updateBedroom(index, 'guests', 1, 1)}
                        className="bg-[#003B5C] text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-[#002b43] transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Beds */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-800 font-medium">Beds</span>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => updateBedroom(index, 'beds', -1, 1)}
                        disabled={bedroom.beds <= 1}
                        className="bg-[#003B5C] text-white rounded-full w-7 h-7 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#002b43] transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-4 text-center font-semibold text-gray-800">{bedroom.beds}</span>
                      <button 
                        onClick={() => updateBedroom(index, 'beds', 1, 1)}
                        className="bg-[#003B5C] text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-[#002b43] transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Bathrooms */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-800 font-medium">Bathrooms</span>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => updateBedroom(index, 'bathrooms', -1, 0)}
                        disabled={bedroom.bathrooms <= 0}
                        className="bg-[#003B5C] text-white rounded-full w-7 h-7 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#002b43] transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-4 text-center font-semibold text-gray-800">{bedroom.bathrooms}</span>
                      <button 
                        onClick={() => updateBedroom(index, 'bathrooms', 1, 0)}
                        className="bg-[#003B5C] text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-[#002b43] transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button 
          onClick={addBedroom}
          className="border border-[#003B5C] text-[#003B5C] rounded-full px-5 py-2 text-sm font-medium mt-6 hover:bg-[#003B5C]/5 transition-colors"
        >
          Add Bedroom +
        </button>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 w-full z-50 bg-white flex flex-col shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        {/* Progress bar injected directly at the top edge */}
        <div className="w-full h-1 bg-gray-200">
          <div 
            className="h-full bg-[#003B5C] transition-all duration-500" 
            style={{ width: `${(5 / 8) * 100}%` }} 
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
