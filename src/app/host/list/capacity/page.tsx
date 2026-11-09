'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import WizardShell from '../_components/WizardShell';
import { useListingDraft } from '@/context/ListingDraftContext';
import {
  addRoom,
  canAddRoom,
  canDecrement,
  canIncrement,
  capacityTotals,
  changeRoom,
  removeRoom,
  roomsFromDraft,
  type RoomCapacity,
  type RoomField,
} from '@/lib/listingCapacity';

const FIELDS: { key: RoomField; label: string }[] = [
  { key: 'guests', label: 'Max guests' },
  { key: 'beds', label: 'Beds' },
  { key: 'bathrooms', label: 'Bathrooms' },
];

export default function CapacityPage() {
  const { draft, update } = useListingDraft();
  const [rooms, setRooms] = useState<RoomCapacity[]>(() => roomsFromDraft(draft));

  // The draft (and the create-listing API) still stores totals only.
  useEffect(() => {
    update(capacityTotals(rooms));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  const totals = capacityTotals(rooms);

  return (
    <WizardShell
      step={5}
      title="Property capacity"
      subtitle="Tell us how many bedrooms you have and the maximum guests, beds and bathrooms in each."
    >
      <div className="space-y-6 w-full max-w-md">
        {rooms.map((room, index) => (
          <section key={index} aria-labelledby={`bedroom-${index}`} className="w-full">
            <h2 id={`bedroom-${index}`} className="text-lg font-bold text-gray-800 mb-3">
              Bedroom {index + 1}
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-6 relative shadow-sm">
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => setRooms((prev) => removeRoom(prev, index))}
                  className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow-md cursor-pointer hover:bg-red-600 transition-colors"
                  aria-label={`Remove bedroom ${index + 1}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              <div className="space-y-6">
                {FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-gray-800 font-medium">{label}</span>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => setRooms((prev) => changeRoom(prev, index, key, -1))}
                        disabled={!canDecrement(rooms, index, key)}
                        aria-label={`Decrease ${label.toLowerCase()} in bedroom ${index + 1}`}
                        className="bg-figma-navy text-white rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-figma-navy/90 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-6 text-center font-semibold text-gray-800" aria-live="polite">
                        {room[key]}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRooms((prev) => changeRoom(prev, index, key, 1))}
                        disabled={!canIncrement(rooms, key)}
                        aria-label={`Increase ${label.toLowerCase()} in bedroom ${index + 1}`}
                        className="bg-figma-navy text-white rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-figma-navy/90 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRooms((prev) => addRoom(prev))}
        disabled={!canAddRoom(rooms)}
        className="border border-figma-navy text-figma-navy rounded-full px-5 py-2 text-sm font-medium mt-6 hover:bg-figma-navy/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Add bedroom +
      </button>

      <p className="mt-6 text-sm text-gray-600">
        Total: {totals.numGuests} guests · {totals.numBedrooms} bedroom{totals.numBedrooms === 1 ? '' : 's'} ·{' '}
        {totals.numBeds} bed{totals.numBeds === 1 ? '' : 's'} · {totals.numBathrooms} bathroom
        {totals.numBathrooms === 1 ? '' : 's'}
      </p>
    </WizardShell>
  );
}
