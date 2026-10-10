'use client';

import { useState } from 'react';
import {
  useListingActions,
  useListingState,
} from '@/context/ListingFilterContext';
import { cn } from '@/lib/utils';
import type { SearchFilters } from '@/types';
import { Star, ChevronDown, Check } from 'lucide-react';
import dynamic from 'next/dynamic';

const MapPreview = dynamic(() => import('@/components/features/MapPreview'), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl bg-gray-100 animate-pulse" style={{ height: 160 }} />
  ),
});

interface FiltersSidebarProps {
  onReset?: () => void;
  city?: string;
  count?: number;
  filters?: SearchFilters;
  onOpenMap?: () => void;
}

function Section({
  title,
  children,
  showClear = false,
  onClear,
  noBorder = false,
}: {
  title: string;
  children: React.ReactNode;
  showClear?: boolean;
  onClear?: () => void;
  noBorder?: boolean;
}) {
  return (
    <div
      className={cn(
        'pb-4 mb-4',
        !noBorder && 'border-b border-dotted border-gray-200',
      )}
    >
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
        {showClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-blue-500 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function CheckChip({
  label,
  checked,
  onChange,
  className,
  disabled = false,
  children,
}: {
  label?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      title={disabled ? 'Coming soon' : undefined}
      className={cn(
        'px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer',
        disabled
          ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
          : checked
            ? 'bg-blue-50 text-blue-500 border-blue-400'
            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:text-gray-900',
        className,
      )}
    >
      {children ? children : <span className="leading-tight">{label}</span>}
    </button>
  );
}

const PROPERTY_TYPES = [
  'House',
  'Apartment / Flat',
  'Guest House',
  'Hotel',
  'Cabin',
  'Villa',
  'Tree House',
  'Tiny Home',
  'Farm Stay',
];

const AMENITY_LIST = [
  'WiFi',
  'Kitchen',
  'Air Conditioning',
  'Heater',
  'TV',
  'Washing Machine',
  'Free Parking',
  'Swimming Pool',
  'Gym',
  'Hot Tub',
  'Balcony',
  'Smoke Alarm',
  'Fire Extinguisher',
  'First Aid Kit',
  'Pet Friendly',
  'BBQ Grill',
  'Garden',
];

const POPULAR_FILTERS: {
  id: string;
  label: string;
  type: 'stayType' | 'boolean';
  key?: keyof SearchFilters;
  stayValue?: string;
}[] = [
  // Every chip here maps onto real listing data (stay type, cancellation
  // policy, breakfast add-on, amenities) -- see /api/search. Chips with no
  // data behind them (bed type, couple/family friendly) were removed rather
  // than left highlighting without changing results.
  { id: 'entire_place', label: 'Entire place', type: 'stayType', stayValue: 'Entire Property' },
  { id: 'private_room', label: 'Private room', type: 'stayType', stayValue: 'Private Room' },
  { id: 'shared_room', label: 'Shared room', type: 'stayType', stayValue: 'Shared Space' },
  { id: 'free_cancellation', label: 'Free cancellation', type: 'boolean', key: 'freeCancellation' },
  { id: 'breakfast', label: 'Breakfast available', type: 'boolean', key: 'breakfast' },
  { id: 'free_wifi', label: 'WiFi', type: 'boolean', key: 'wifi' },
  { id: 'parking', label: 'Parking', type: 'boolean', key: 'parking' },
  { id: 'ac', label: 'AC', type: 'boolean', key: 'ac' },
];

function PriceSlider({
  min,
  max,
  onPriceChange,
}: {
  min: number;
  max: number;
  onPriceChange: (min: number, max: number) => void;
}) {
  const MIN = 0;
  // Must match the "no upper filter" sentinel used everywhere else
  // (ListingFilterContext/HomeSections/api.ts all treat priceMax=100000 as
  // "unbounded"). This used to be hardcoded to 15000 -- a stale value from
  // before the price ceiling was raised -- which clamped the max thumb to
  // 100% no matter the actual filters.priceMax, and put the tick labels on
  // a completely different, much smaller scale than the "Min - Max" text
  // directly above them.
  const MAX = 100000;
  const pct1 = Math.min(100, Math.max(0, (min / MAX) * 100));
  const pct2 = Math.min(100, Math.max(0, (max / MAX) * 100));

  const ticks = [
    { v: 0, label: '₹0' },
    { v: 25000, label: '₹25k' },
    { v: 50000, label: '₹50k' },
    { v: 75000, label: '₹75k' },
    { v: 100000, label: '₹100k+' },
  ];

  return (
    <div className="mt-1 overflow-x-hidden">
      {/* Price label */}
      <p className="text-[14px] font-medium text-gray-800 mb-3.5">
        Min - Max : ₹ {min.toLocaleString()} - ₹ {max.toLocaleString()}
      </p>

      {/* Ticks positioned above track */}
      <div className="relative h-6 mb-1 px-3 w-full">
        {ticks.map((tick) => {
          const pct = (tick.v / MAX) * 100;
          return (
            <div
              key={tick.v}
              className="absolute flex flex-col items-center -translate-x-1/2"
              style={{ left: `calc(${pct}% * (100% - 24px) / 100% + 12px)` }}
            >
              <span className="text-[10px] font-medium text-gray-500 whitespace-nowrap">
                {tick.label}
              </span>
              <svg
                width="6"
                height="4"
                viewBox="0 0 6 4"
                fill="none"
                className="text-gray-400 mt-0.5"
              >
                <path d="M3 4L0 0H6L3 4Z" fill="currentColor" />
              </svg>
            </div>
          );
        })}
      </div>

      {/* Dual range track */}
      <div className="relative h-7 flex items-center px-3 w-full">
        {/* Background track (Thick & Pill-shaped) */}
        <div className="absolute left-3 right-3 h-3 bg-[#EAF2F8] rounded-full" />
        {/* Active range fill (Muted steel-blue) */}
        <div
          className="absolute h-3 bg-[#6B8E9E] rounded-full"
          style={{
            left: `calc(${pct1}% * (100% - 24px) / 100% + 12px)`,
            right: `calc((100% - ${pct2}%) * (100% - 24px) / 100% + 12px)`,
          }}
        />
        {/* Min thumb indicator (Dark-blue with white border & shadow) */}
        <div
          className="absolute w-6 h-6 bg-[#004772] rounded-full border-2 border-white shadow-md pointer-events-none z-30"
          style={{ left: `calc(${pct1}% * (100% - 24px) / 100%)` }}
        />
        {/* Max thumb indicator (Dark-blue with white border & shadow) */}
        <div
          className="absolute w-6 h-6 bg-[#004772] rounded-full border-2 border-white shadow-md pointer-events-none z-30"
          style={{ left: `calc(${pct2}% * (100% - 24px) / 100%)` }}
        />
        {/* Min range input */}
        <input
          type="range"
          aria-label="Minimum price per night"
          min={MIN}
          max={MAX}
          step={100}
          value={min}
          onChange={(e) => {
            const v = +e.target.value;
            if (v < max) onPriceChange(v, max);
          }}
          className="range-thumb-only absolute inset-0 w-full opacity-0 cursor-pointer z-40"
          style={{ height: '100%' }}
        />
        {/* Max range input */}
        <input
          type="range"
          aria-label="Maximum price per night"
          min={MIN}
          max={MAX}
          step={100}
          value={max}
          onChange={(e) => {
            const v = +e.target.value;
            if (v > min) onPriceChange(min, v);
          }}
          className="range-thumb-only absolute inset-0 w-full opacity-0 cursor-pointer z-50"
          style={{ height: '100%' }}
        />
      </div>

      {/* Floating Min / Max labels below thumbs */}
      <div className="relative h-5 mt-1 px-3 w-full">
        <span
          className="absolute text-[11px] font-medium text-gray-800 pointer-events-none text-center -translate-x-1/2 whitespace-nowrap"
          style={{ left: `calc(${pct1}% * (100% - 24px) / 100% + 12px)` }}
        >
          Min
        </span>
        <span
          className="absolute text-[11px] font-medium text-gray-800 pointer-events-none text-center -translate-x-1/2 whitespace-nowrap"
          style={{ left: `calc(${pct2}% * (100% - 24px) / 100% + 12px)` }}
        >
          Max
        </span>
      </div>
    </div>
  );
}

export default function FiltersSidebar({
  onReset,
  city = 'New Delhi',
  count = 0,
  onOpenMap,
}: FiltersSidebarProps) {
  const { filters } = useListingState();
  const {
    setPriceRange,
    setRating,
    setSort,
    toggleAmenity,
    togglePropertyType,
    toggleStayType,
    setBooleanFilter,
    clearFilters,
  } = useListingActions();

  const [showAllPropertyTypes, setShowAllPropertyTypes] = useState(false);
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const [ratingOrder, setRatingOrder] = useState<'asc' | 'desc' | null>(null);

  const handleReset = () => {
    clearFilters();
    setRatingOrder(null);
    if (onReset) onReset();
  };

  const displayedPropertyTypes = showAllPropertyTypes
    ? PROPERTY_TYPES
    : PROPERTY_TYPES.slice(0, 6);

  const displayedAmenities = showAllAmenities
    ? AMENITY_LIST
    : AMENITY_LIST.slice(0, 8);

  return (
    <aside className="w-[280px] lg:w-[320px] xl:w-[360px] flex-shrink-0 max-w-full">
      {/* Map Preview */}
      <div className="mb-5">
        <MapPreview city={city} count={count} onOpen={onOpenMap} />
      </div>

      {/* Filters Main Header */}
      <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-dotted border-gray-200">
        <h2 className="text-lg font-bold text-gray-900">Filters</h2>
        <button
          type="button"
          onClick={handleReset}
          className="text-sm font-medium text-blue-500 hover:text-blue-600 hover:underline transition-colors cursor-pointer"
        >
          Clear all
        </button>
      </div>

      {/* Price Range */}
      <Section title="Price Range">
        <PriceSlider
          min={filters.priceMin}
          max={filters.priceMax}
          onPriceChange={(min, max) => setPriceRange([min, max])}
        />
      </Section>

      {/* Popular Filters */}
      <Section title="Popular Filters">
        <div className="flex flex-wrap gap-2">
          {POPULAR_FILTERS.map((item) => {
            const isChecked =
              item.type === 'stayType' && item.stayValue
                ? filters.stayTypes.includes(item.stayValue)
                : item.type === 'boolean' && item.key
                  ? Boolean(filters[item.key])
                  : false;

            return (
              <CheckChip
                key={item.id}
                label={item.label}
                checked={isChecked}
                onChange={() => {
                  if (item.type === 'stayType' && item.stayValue) {
                    toggleStayType(item.stayValue);
                  } else if (item.type === 'boolean' && item.key) {
                    setBooleanFilter(item.key, !filters[item.key]);
                  }
                }}
              />
            );
          })}
        </div>
      </Section>

      {/* Guest Ratings */}
      <Section title="Guest ratings">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <CheckChip
              checked={filters.guestRating === 3}
              onChange={() => setRating(filters.guestRating === 3 ? null : 3)}
              className="flex-1 min-w-[100px]"
            >
              <span>3</span>
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>or above</span>
            </CheckChip>
            <CheckChip
              checked={filters.guestRating === 4}
              onChange={() => setRating(filters.guestRating === 4 ? null : 4)}
              className="flex-1"
            >
              <span>4</span>
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            </CheckChip>
            <CheckChip
              checked={filters.guestRating === 5}
              onChange={() => setRating(filters.guestRating === 5 ? null : 5)}
              className="flex-1"
            >
              <span>5</span>
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            </CheckChip>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <CheckChip
              label="Lowest to highest"
              checked={ratingOrder === 'asc'}
              onChange={() => {
                const next = ratingOrder === 'asc' ? null : 'asc';
                setRatingOrder(next);
                if (next === 'asc') setSort('price_asc');
              }}
              className="flex-1 text-xs"
            />
            <CheckChip
              label="Highest to lowest"
              checked={ratingOrder === 'desc'}
              onChange={() => {
                const next = ratingOrder === 'desc' ? null : 'desc';
                setRatingOrder(next);
                if (next === 'desc') setSort('price_desc');
              }}
              className="flex-1 text-xs"
            />
          </div>
        </div>
      </Section>

      {/* Property Type */}
      <Section title="Property Type">
        <div className="flex flex-wrap gap-2">
          {displayedPropertyTypes.map((pt) => (
            <CheckChip
              key={pt}
              label={pt}
              checked={filters.propertyTypes.includes(pt)}
              onChange={() => togglePropertyType(pt)}
            />
          ))}
        </div>
        {PROPERTY_TYPES.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAllPropertyTypes((prev) => !prev)}
            className="mt-2.5 flex items-center gap-1 text-[13px] font-medium text-blue-500 hover:text-blue-600 cursor-pointer"
          >
            <span>{showAllPropertyTypes ? 'View less' : 'View all'}</span>
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 transition-transform',
                showAllPropertyTypes && 'rotate-180',
              )}
            />
          </button>
        )}
      </Section>

      {/* Facilities */}
      <Section title="Facilities">
        <div className="flex flex-wrap gap-2">
          {displayedAmenities.map((am) => (
            <CheckChip
              key={am}
              label={am}
              checked={filters.amenities.includes(am)}
              onChange={() => toggleAmenity(am)}
            />
          ))}
        </div>
        {AMENITY_LIST.length > 8 && (
          <button
            type="button"
            onClick={() => setShowAllAmenities((prev) => !prev)}
            className="mt-2.5 flex items-center gap-1 text-[13px] font-medium text-blue-500 hover:text-blue-600 cursor-pointer"
          >
            <span>{showAllAmenities ? 'View less' : 'View all'}</span>
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 transition-transform',
                showAllAmenities && 'rotate-180',
              )}
            />
          </button>
        )}
      </Section>

    </aside>
  );
}
