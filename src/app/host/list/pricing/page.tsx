'use client';

import { useEffect, useState } from 'react';
import WizardShell from '../_components/WizardShell';
import { useListingDraft } from '@/context/ListingDraftContext';
import { calculateBookingInvoice } from '@/lib/billing/invoice';
import { calculateHostPayout } from '@/lib/billing/payout';
import { weekendPriceHint } from '@/lib/weekendPriceHint';
import { formatINR } from '@/lib/format';

// Same bounds the server enforces on publish (/api/host/listings).
const MIN_PRICE = 100;
const MAX_PRICE = 500000;

function priceError(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return 'Enter a nightly price.';
  if (!Number.isInteger(value)) return 'Use whole rupees.';
  if (value < MIN_PRICE) return `Minimum is ${formatINR(MIN_PRICE)} per night.`;
  if (value > MAX_PRICE) return `Maximum is ${formatINR(MAX_PRICE)} per night.`;
  return null;
}

/** What a guest pays for one night at `base`, incl. GST and service fee. */
const guestNightly = (base: number) =>
  base > 0 ? calculateBookingInvoice({ basePropertyPrice: base }).grandTotalRupees : 0;
/** What the host receives for one night at `base`, after commission, TCS and TDS. */
const hostNightly = (base: number) =>
  base > 0 ? calculateHostPayout({ propertyPrice: base }).netHostPayoutRupees : 0;

export default function PricingPage() {
  const { draft, update } = useListingDraft();

  const [weekdayPrice, setWeekdayPrice] = useState(draft.priceWeekday ?? 2999);

  // If priceWeekend exists and is different, we start in 'different' mode
  const initialSame = draft.priceWeekend === undefined || draft.priceWeekend === draft.priceWeekday;
  const [sameAsWeekday, setSameAsWeekday] = useState(initialSame);

  const [weekendPrice, setWeekendPrice] = useState(
    draft.priceWeekend ?? Math.round((draft.priceWeekday ?? 2999) * 1.1),
  );

  useEffect(() => {
    update({
      priceWeekday: weekdayPrice,
      priceWeekend: sameAsWeekday ? weekdayPrice : weekendPrice,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekdayPrice, weekendPrice, sameAsWeekday]);

  // Calculate percentage difference
  const effectiveWeekend = sameAsWeekday ? weekdayPrice : weekendPrice;
  const priceHint = weekendPriceHint(weekdayPrice, effectiveWeekend);

  // Payout preview from the real billing functions -- the exact invoice a
  // guest is charged and the exact payout the host receives.
  const fmt = formatINR;
  const guestPrice = guestNightly;
  const earn = hostNightly;
  const weekdayError = priceError(weekdayPrice);
  const weekendError = sameAsWeekday ? null : priceError(weekendPrice);

  return (
    <WizardShell
      step={10}
      title="Set your price"
      subtitle="You can change it anytime after you publish your listing."
      nextDisabled={!!weekdayError || !!weekendError}
    >
      <div className="max-w-xl">
        <div className="space-y-12">
          {/* Weekday Price */}
          <div className="space-y-5">
            <div>
              <h3 className="text-[20px] font-bold text-gray-900">Weekday price</h3>
              <p className="text-[15px] text-gray-500">Sunday to Thursday nights</p>
            </div>
            <div className="flex items-center border-2 border-gray-200 rounded-2xl overflow-hidden focus-within:border-figma-navy focus-within:bg-figma-navy/5 transition-all">
              <div className="pl-5 pr-2 text-[24px] font-extrabold text-gray-900">₹</div>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_PRICE}
                max={MAX_PRICE}
                step={1}
                aria-label="Weekday price per night"
                aria-invalid={!!weekdayError}
                value={weekdayPrice || ''}
                onChange={(e) => setWeekdayPrice(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="w-full py-5 text-[24px] font-extrabold outline-none border-none focus:ring-0 text-gray-900 placeholder:text-gray-300 bg-transparent"
              />
              <div className="pr-5 pl-2 text-[15px] font-bold text-gray-400 whitespace-nowrap bg-transparent">
                / Night
              </div>
            </div>
            {weekdayError && <p className="text-[13px] font-medium text-red-600">{weekdayError}</p>}
          </div>

          <hr className="border-t border-gray-200" />

          {/* Weekend Price */}
          <div className="space-y-5">
            <div>
              <h3 className="text-[20px] font-bold text-gray-900">Weekend price</h3>
              <p className="text-[15px] text-gray-500">Friday and Saturday nights</p>
            </div>

            <div className="space-y-4 pt-2">
              <label className="flex items-center gap-4 cursor-pointer group p-4 border-2 border-gray-100 rounded-2xl hover:border-gray-200 transition-colors">
                <div className="relative flex items-center justify-center">
                  <input
                    type="radio"
                    name="weekendMode"
                    className="peer sr-only"
                    checked={sameAsWeekday}
                    onChange={() => setSameAsWeekday(true)}
                  />
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 peer-checked:border-figma-navy flex items-center justify-center transition-colors">
                    {sameAsWeekday && <div className="w-2.5 h-2.5 rounded-full bg-figma-navy" />}
                  </div>
                </div>
                <span className="text-[16px] font-bold text-gray-600 group-hover:text-gray-900 transition-colors">Same as weekday</span>
              </label>

              <label className="flex items-center gap-4 cursor-pointer group p-4 border-2 border-gray-100 rounded-2xl hover:border-gray-200 transition-colors">
                <div className="relative flex items-center justify-center">
                  <input
                    type="radio"
                    name="weekendMode"
                    className="peer sr-only"
                    checked={!sameAsWeekday}
                    onChange={() => setSameAsWeekday(false)}
                  />
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 peer-checked:border-figma-navy flex items-center justify-center transition-colors">
                    {!sameAsWeekday && <div className="w-2.5 h-2.5 rounded-full bg-figma-navy" />}
                  </div>
                </div>
                <span className={`text-[16px] font-bold transition-colors ${!sameAsWeekday ? 'text-figma-navy' : 'text-gray-600 group-hover:text-gray-900'}`}>
                  Set a different price
                </span>
              </label>
            </div>

            {!sameAsWeekday && (
              <div className="pt-4 space-y-3 animate-in slide-in-from-top-2 fade-in duration-200">
                <div className="flex items-center border-2 border-gray-200 rounded-2xl overflow-hidden focus-within:border-figma-navy focus-within:bg-figma-navy/5 transition-all">
                  <div className="pl-5 pr-2 text-[24px] font-extrabold text-gray-900">₹</div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MIN_PRICE}
                    max={MAX_PRICE}
                    step={1}
                    aria-label="Weekend price per night"
                    aria-invalid={!!weekendError}
                    value={weekendPrice || ''}
                    onChange={(e) => setWeekendPrice(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className="w-full py-5 text-[24px] font-extrabold outline-none border-none focus:ring-0 text-gray-900 placeholder:text-gray-300 bg-transparent"
                  />
                  <div className="pr-5 pl-2 text-[15px] font-bold text-gray-400 whitespace-nowrap bg-transparent">
                    / Night
                  </div>
                </div>
                {weekendError && <p className="text-[13px] font-medium text-red-600">{weekendError}</p>}
                {!weekendError && priceHint.kind !== 'none' && (
                  <p className={`text-[13px] font-bold flex items-center gap-2 ml-1 ${priceHint.kind === 'higher' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white ${priceHint.kind === 'higher' ? 'bg-emerald-500' : 'bg-amber-500'}`}>!</span>
                    {priceHint.kind === 'extreme'
                      ? priceHint.message
                      : `${priceHint.percent}% ${priceHint.kind} than weekday price`}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Payout breakdown -- what the host actually sees before publishing */}
          <div className="bg-white rounded-2xl p-6 shadow-card border border-gray-200 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Weekday: guest pays per night (incl. GST &amp; fees)</span>
              <span className="text-sm font-semibold text-gray-800">{fmt(guestPrice(weekdayPrice))}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Weekend: guest pays per night (incl. GST &amp; fees)</span>
              <span className="text-sm font-semibold text-gray-800">{fmt(guestPrice(effectiveWeekend))}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-dashed border-gray-200">
              <span className="text-sm font-bold text-figma-navy">You earn per night (weekday / weekend)</span>
              <span className="text-lg font-bold text-figma-navy">
                {fmt(earn(weekdayPrice))} / {fmt(earn(effectiveWeekend))}
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-gray-500">
              Your earnings are after Hostiggo&apos;s 5% commission and 1% TCS + 1% TDS (claimable when you
              file taxes). Guests also pay GST and an 8% Hostiggo service fee, which don&apos;t come out of your
              earnings.
            </p>
          </div>
        </div>
      </div>
    </WizardShell>
  );
}
