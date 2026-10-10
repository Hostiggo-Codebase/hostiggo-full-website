'use client';

import { useEffect } from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import WizardShell from '../_components/WizardShell';
import { useListingDraft } from '@/context/ListingDraftContext';
import { STATES_AND_UTS } from '@/lib/indianStates';

export default function AddressPage() {
  const { draft, update } = useListingDraft();

  const handleUpdate = (field: string, value: string) => {
    update({ [field]: value });
  };

  // "Country" is a single-option select (India is the only choice) -- its
  // onChange never fires since there's nothing else to pick, so draft.country
  // would otherwise never actually get set despite always *displaying*
  // "India". Seed it once so it isn't silently missing from isComplete.
  useEffect(() => {
    if (!draft.country) update({ country: 'India' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const missingFields = [
    !draft.addressLine1 && 'street address',
    !draft.city && 'city',
    !draft.state && 'state',
    !draft.postalCode && 'postal code',
  ].filter((f): f is string => Boolean(f));
  const isComplete = missingFields.length === 0;

  return (
    <WizardShell
      step={4}
      title="Confirm Address"
      subtitle="This will help us to locate your homestay accurately"
      nextDisabled={!isComplete}
    >
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">
              Country / Region
            </label>
            <select
              value={draft.country || 'India'}
              onChange={(e) => handleUpdate('country', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none text-sm appearance-none"
            >
              <option value="India">India</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">
              Street address
            </label>
            <input
              type="text"
              placeholder="Street address"
              value={draft.addressLine1 || ''}
              onChange={(e) => handleUpdate('addressLine1', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">
              Nearby Landmark (Optional)
            </label>
            <input
              type="text"
              placeholder="Nearby Landmark (Optional)"
              value={draft.landmark || ''}
              onChange={(e) => handleUpdate('landmark', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">
              City / Town
            </label>
            <input
              type="text"
              placeholder="City / Town"
              value={draft.city || ''}
              onChange={(e) => handleUpdate('city', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">
                State / UT
              </label>
              <select
                value={draft.state || ''}
                onChange={(e) => handleUpdate('state', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none text-sm appearance-none"
              >
                <option value="" disabled>Select State</option>
                {STATES_AND_UTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">
                Postal Code
              </label>
              <input
                type="text"
                placeholder="Postal Code"
                value={draft.postalCode || ''}
                onChange={(e) => handleUpdate('postalCode', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none text-sm"
              />
            </div>
          </div>

          {/* The map pin on the previous step usually fills in city/state/
              postal code automatically, but reverse-geocoding doesn't always
              return all three -- this tells the host exactly what's still
              missing instead of leaving them staring at a disabled Next
              button with no explanation. */}
          {missingFields.length > 0 && (
            <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Please fill in {missingFields.join(', ')} before continuing.
              </p>
            </div>
          )}

          <div className="mt-6 flex gap-3 p-4 bg-green-50/50 border border-green-100 rounded-xl">
            <ShieldCheck className="w-5 h-5 text-green-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-green-900 mb-0.5">
                Your Privacy Matters
              </p>
              <p className="text-xs text-green-800 leading-relaxed">
                We only use your address to show an approximate location to guests.
                Your exact address is shared only after a booking is confirmed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </WizardShell>
  );
}
