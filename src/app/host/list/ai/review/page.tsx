'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ChevronRight, Loader2, Star, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { reverseGeocode, resolveLocationId } from '@/lib/services/geocoding';
import {
  dbIdsFromStringIds,
  stringIdsFromDbIds,
} from '@/lib/amenityCatalog';
import AmenityGrid from '@/components/features/AmenityGrid';
import ListingLocationMap from '@/components/features/ListingLocationMap';
import AiFlowShell from '../_components/AiFlowShell';
import AddressSearch from '../../_components/AddressSearch';
import { loadGeneratedListings, saveGeneratedListings, type AiGeneratedListing } from '../_lib/aiImportDraft';

const SECTIONS = [
  'Basic Information',
  'Description',
  'Property Details',
  'Photos',
  'Amenities',
  'Location',
  'House Rules',
  'Pricing',
] as const;
type Section = (typeof SECTIONS)[number];

// Editable fields for whichever listing is currently active. Kept separate
// from AiGeneratedListing so free typing doesn't thrash the listings array
// (and localStorage) on every keystroke -- edits are committed back into
// the array on tab switch and on Continue.
type EditableFields = {
  title: string;
  description: string;
  propertyType: string;
  stayType: 'entire' | 'private' | 'shared';
  numGuests: number;
  numBedrooms: number;
  numBeds: number;
  numBathrooms: number;
  priceWeekday: number;
  priceWeekend: number;
  photos: string[];
  amenitySel: Set<string>;
  lat: number | undefined;
  lng: number | undefined;
  addr: string;
  locationId: number | undefined;
  city: string | undefined;
  stateName: string | undefined;
  postalCode: string | undefined;
  houseRules: {
    check_in_time: string;
    check_out_time: string;
    smoking_allowed: boolean;
    pets_allowed: boolean;
    parties_allowed: boolean;
    quiet_hours: boolean;
  };
};

function toEditable(g: AiGeneratedListing): EditableFields {
  return {
    title: g.title,
    description: g.description,
    propertyType: g.propertyType || 'apartment',
    stayType: g.stayType || 'entire',
    numGuests: g.numGuests,
    numBedrooms: g.numBedrooms,
    numBeds: g.numBeds,
    numBathrooms: g.numBathrooms,
    priceWeekday: g.priceWeekday,
    priceWeekend: g.priceWeekend || g.priceWeekday,
    photos: g.photoUrls ?? [],
    amenitySel: stringIdsFromDbIds(g.amenityIds),
    lat: g.latitude,
    lng: g.longitude,
    addr: g.addressLine1 ?? '',
    locationId: g.locationId,
    city: g.city,
    stateName: g.state,
    postalCode: g.postalCode,
    houseRules: {
      check_in_time: g.houseRules?.check_in_time || '15:00',
      check_out_time: g.houseRules?.check_out_time || '11:00',
      smoking_allowed: g.houseRules?.smoking_allowed ?? false,
      pets_allowed: g.houseRules?.pets_allowed ?? false,
      parties_allowed: g.houseRules?.parties_allowed ?? false,
      quiet_hours: g.houseRules?.quiet_hours ?? true,
    },
  };
}

function commitEditable(base: AiGeneratedListing, e: EditableFields): AiGeneratedListing {
  return {
    ...base,
    title: e.title,
    description: e.description,
    propertyType: e.propertyType,
    stayType: e.stayType,
    numGuests: e.numGuests,
    numBedrooms: e.numBedrooms,
    numBeds: e.numBeds,
    numBathrooms: e.numBathrooms,
    priceWeekday: e.priceWeekday,
    priceWeekend: e.priceWeekend || e.priceWeekday,
    photoUrls: e.photos,
    amenityIds: dbIdsFromStringIds(e.amenitySel),
    latitude: e.lat,
    longitude: e.lng,
    locationId: e.locationId,
    addressLine1: e.addr,
    city: e.city,
    state: e.stateName,
    postalCode: e.postalCode,
    houseRules: e.houseRules,
  };
}

export default function AiReviewPage() {
  const router = useRouter();
  const [listings, setListings] = useState<AiGeneratedListing[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reviewedIndices, setReviewedIndices] = useState<Set<number>>(new Set());
  const [activeSection, setActiveSection] = useState<Section>('Basic Information');
  const [hydrated, setHydrated] = useState(false);
  const [edit, setEdit] = useState<EditableFields | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [detectingLoc, setDetectingLoc] = useState(false);

  useEffect(() => {
    const loaded = loadGeneratedListings();
    if (loaded.length === 0) {
      // Nothing generated yet -- send them back to start the import.
      router.replace('/host/list/ai/setup');
      return;
    }
    setListings(loaded);
    setEdit(toEditable(loaded[0]));
    setHydrated(true);
  }, [router]);

  if (!hydrated || !edit || listings.length === 0) return null;

  const active = listings[activeIndex];
  const isMulti = listings.length > 1;

  const updateEdit = (patch: Partial<EditableFields>) => setEdit((e) => (e ? { ...e, ...patch } : e));

  const switchTo = (index: number) => {
    if (index === activeIndex || !edit) return;
    // Persist the tab being left before loading the next one.
    const updated = listings.map((l, i) => (i === activeIndex ? commitEditable(l, edit) : l));
    setListings(updated);
    saveGeneratedListings(updated);
    setReviewedIndices((prev) => new Set(prev).add(activeIndex));
    setActiveIndex(index);
    setEdit(toEditable(updated[index]));
    setActiveSection('Basic Information');
  };

  const toggleAmenity = (id: string) =>
    setEdit((e) => {
      if (!e) return e;
      const next = new Set(e.amenitySel);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...e, amenitySel: next };
    });

  const handleAddressSelect = async (nextLat: number, nextLng: number, address: string) => {
    updateEdit({ lat: nextLat, lng: nextLng, addr: address });
    setDetectingLoc(true);
    try {
      const result = await reverseGeocode(nextLat, nextLng);
      if (result) {
        const resolved = await resolveLocationId(result.address.city, result.address.county);
        updateEdit({
          city: result.address.city,
          stateName: result.address.state,
          postalCode: result.address.postcode,
          ...(resolved ? { locationId: resolved } : {}),
        });
      }
    } finally {
      setDetectingLoc(false);
    }
  };

  const removePhoto = (url: string) =>
    updateEdit({ photos: edit.photos.filter((p) => p !== url) });
  const makeCover = (url: string) =>
    updateEdit({ photos: [url, ...edit.photos.filter((p) => p !== url)] });

  const handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploadingPhoto(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          throw new Error(`${file.name}: only JPG, PNG and WEBP images are allowed.`);
        }
        if (file.size > 8 * 1024 * 1024) {
          throw new Error(`${file.name}: image must be smaller than 8MB.`);
        }
        uploaded.push(await api.uploadPhoto(file));
      }
      updateEdit({ photos: [...edit.photos, ...uploaded] });
      toast.success(`${uploaded.length} photo${uploaded.length === 1 ? '' : 's'} added.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleContinue = () => {
    if (edit.photos.length < 3) {
      toast.error('Add at least 3 photos before continuing.');
      setActiveSection('Photos');
      return;
    }
    if (!edit.title.trim() || !edit.description.trim()) {
      toast.error('Add a title and description before continuing.');
      setActiveSection(!edit.title.trim() ? 'Basic Information' : 'Description');
      return;
    }
    const updated = listings.map((l, i) => (i === activeIndex ? commitEditable(l, edit) : l));
    saveGeneratedListings(updated);
    setReviewedIndices((prev) => new Set(prev).add(activeIndex));
    router.push('/host/list/ai/publish');
  };

  return (
    <AiFlowShell stage="review" onBack={() => router.push('/host/list/ai/processing')}>
      <button
        type="button"
        onClick={() => router.push('/host/list/ai/processing')}
        className="text-sm font-semibold text-figma-navy hover:underline mb-4 inline-block"
      >
        ← Back to Review
      </button>

      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Edit Listing Details</h1>
        <span className="text-[11px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2.5 py-1">
          Editing
        </span>
      </div>
      <p className="text-gray-500 mb-6">
        {isMulti
          ? `Make changes to your ${listings.length} AI-generated listings before publishing.`
          : 'Make changes to your AI-generated listing before publishing.'}
      </p>

      {isMulti && (
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {listings.map((l, i) => (
            <button
              key={l.sourceUrl + i}
              type="button"
              onClick={() => switchTo(i)}
              className={cn(
                'flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
                i === activeIndex
                  ? 'bg-figma-navy text-white border-figma-navy'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-figma-navy/40',
              )}
            >
              {reviewedIndices.has(i) && (
                <Check className={cn('w-3.5 h-3.5', i === activeIndex ? 'text-white' : 'text-emerald-500')} />
              )}
              {l.title || `Listing ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-[1fr_280px] gap-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-6 space-y-6">
          {activeSection === 'Basic Information' && (
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-4">
                <span className="w-5 h-5 rounded-full bg-figma-navy/10 text-figma-navy text-xs flex items-center justify-center">1</span>
                Basic Information
              </p>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                Listing Title<span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={edit.title}
                maxLength={120}
                onChange={(e) => updateEdit({ title: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-figma-navy focus:ring-1 focus:ring-figma-navy transition-all"
              />
              <p className="text-xs text-gray-500 mt-1">{edit.title.length}/120 characters</p>
            </div>
          )}

          {activeSection === 'Description' && (
            <div>
              <p className="text-sm font-bold text-gray-900 mb-4">Description</p>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                Property Description<span className="text-red-500">*</span>
              </label>
              <textarea
                value={edit.description}
                onChange={(e) => updateEdit({ description: e.target.value })}
                rows={6}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-figma-navy focus:ring-1 focus:ring-figma-navy transition-all resize-none"
              />
            </div>
          )}

          {activeSection === 'Property Details' && (
            <div>
              <p className="text-sm font-bold text-gray-900 mb-4">Property Details</p>
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-500">
                  Property type
                  <select
                    value={edit.propertyType}
                    onChange={(e) => updateEdit({ propertyType: e.target.value })}
                    className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white outline-none focus:border-figma-navy focus:ring-1 focus:ring-figma-navy"
                  >
                    {[
                      ['house', 'House'],
                      ['apartment', 'Apartment / Flat'],
                      ['guest-house', 'Guest House'],
                      ['hotel', 'Hotel'],
                      ['cabin', 'Cabin'],
                      ['villa', 'Villa'],
                      ['tree-house', 'Treehouse'],
                      ['tiny-home', 'Tiny Home'],
                      ['farm-stay', 'Farm Stay'],
                    ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-500">
                  Stay type
                  <select
                    value={edit.stayType}
                    onChange={(e) => updateEdit({ stayType: e.target.value as EditableFields['stayType'] })}
                    className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white outline-none focus:border-figma-navy focus:ring-1 focus:ring-figma-navy"
                  >
                    <option value="entire">Entire property</option>
                    <option value="private">Private room</option>
                    <option value="shared">Shared space</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Guests', value: edit.numGuests, set: (v: number) => updateEdit({ numGuests: v }) },
                  { label: 'Bedrooms', value: edit.numBedrooms, set: (v: number) => updateEdit({ numBedrooms: v }) },
                  { label: 'Beds', value: edit.numBeds, set: (v: number) => updateEdit({ numBeds: v }) },
                  { label: 'Bathrooms', value: edit.numBathrooms, set: (v: number) => updateEdit({ numBathrooms: v }) },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                      {f.label}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={f.value}
                      onChange={(e) => f.set(Number(e.target.value) || 0)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-figma-navy focus:ring-1 focus:ring-figma-navy transition-all"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'Photos' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-gray-900">Photos ({edit.photos.length})</p>
                  <p className={cn('text-xs mt-1', edit.photos.length < 3 ? 'text-amber-700' : 'text-emerald-700')}>
                    {edit.photos.length < 3
                      ? `Add ${3 - edit.photos.length} more photo${3 - edit.photos.length === 1 ? '' : 's'} to publish.`
                      : 'Minimum reached. Add more photos or change the cover.'}
                  </p>
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-figma-navy cursor-pointer hover:underline">
                  {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploadingPhoto ? 'Uploading…' : 'Add photos'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    disabled={uploadingPhoto}
                    onChange={handleAddPhoto}
                  />
                </label>
              </div>
              {edit.photos.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No photos were imported. Add some so your listing stands out.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {edit.photos.map((url, i) => (
                    <div key={url} className="relative group rounded-xl overflow-hidden bg-gray-100 aspect-[4/3]">
                      <Image src={url} alt={`Photo ${i + 1}`} fill sizes="200px" className="object-cover" />
                      {i === 0 && (
                        <span className="absolute top-2 left-2 bg-figma-navy text-white text-[10px] font-bold rounded-full px-2 py-0.5 flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 fill-current" /> Cover
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        {i !== 0 && (
                          <button
                            type="button"
                            onClick={() => makeCover(url)}
                            title="Make cover photo"
                            className="p-2 rounded-lg bg-white/90 text-gray-700 hover:bg-white"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removePhoto(url)}
                          title="Remove photo"
                          className="p-2 rounded-lg bg-red-500/90 text-white hover:bg-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === 'Amenities' && (
            <div>
              <p className="text-sm font-bold text-gray-900 mb-2">Amenities</p>
              {(active.amenityLabels?.length ?? 0) > 0 && (
                <p className="text-xs text-gray-500 mb-4">
                  Detected from source: {active.amenityLabels.join(', ')}
                </p>
              )}
              <AmenityGrid selected={edit.amenitySel} onToggle={toggleAmenity} />
            </div>
          )}

          {activeSection === 'Location' && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-gray-900">Location</p>
              <ListingLocationMap latitude={edit.lat} longitude={edit.lng} heightClass="h-56" />
              <AddressSearch
                value={edit.addr}
                onChange={(v) => updateEdit({ addr: v })}
                onSelect={handleAddressSelect}
                placeholder="Search the property address"
              />
              <p className="text-xs text-gray-500">
                {detectingLoc
                  ? 'Detecting location…'
                  : edit.city || edit.stateName
                    ? `Detected: ${[edit.city, edit.stateName].filter(Boolean).join(', ')}${
                        edit.locationId ? '' : ' (no curated match -- still saved by coordinates)'
                      }`
                    : 'Pick a suggestion to pin the exact spot.'}
              </p>
            </div>
          )}

          {activeSection === 'House Rules' && (
            <div className="space-y-5">
              <p className="text-sm font-bold text-gray-900">House Rules</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Check-in time
                  <input
                    type="time"
                    value={edit.houseRules.check_in_time}
                    onChange={(e) => updateEdit({ houseRules: { ...edit.houseRules, check_in_time: e.target.value } })}
                    className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900"
                  />
                </label>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Check-out time
                  <input
                    type="time"
                    value={edit.houseRules.check_out_time}
                    onChange={(e) => updateEdit({ houseRules: { ...edit.houseRules, check_out_time: e.target.value } })}
                    className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900"
                  />
                </label>
              </div>
              <div className="space-y-2">
                {([
                  ['smoking_allowed', 'Smoking allowed'],
                  ['pets_allowed', 'Pets allowed'],
                  ['parties_allowed', 'Parties or events allowed'],
                  ['quiet_hours', 'Quiet hours enforced (10 PM - 8 AM)'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
                    {label}
                    <input
                      type="checkbox"
                      checked={edit.houseRules[key]}
                      onChange={(e) => updateEdit({ houseRules: { ...edit.houseRules, [key]: e.target.checked } })}
                      className="h-4 w-4 accent-figma-navy"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'Pricing' && (
            <div>
              <p className="text-sm font-bold text-gray-900 mb-4">Pricing</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                    Weekday price
                  </label>
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-figma-navy focus-within:ring-1 focus-within:ring-figma-navy transition-all">
                    <span className="pl-4 pr-1 text-gray-500">₹</span>
                    <input
                      type="number"
                      min={0}
                      value={edit.priceWeekday}
                      onChange={(e) => updateEdit({ priceWeekday: Number(e.target.value) || 0 })}
                      className="w-full py-2.5 pr-4 text-sm text-gray-900 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                    Weekend price
                  </label>
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-figma-navy focus-within:ring-1 focus-within:ring-figma-navy transition-all">
                    <span className="pl-4 pr-1 text-gray-500">₹</span>
                    <input
                      type="number"
                      min={0}
                      value={edit.priceWeekend}
                      onChange={(e) => updateEdit({ priceWeekend: Number(e.target.value) || 0 })}
                      className="w-full py-2.5 pr-4 text-sm text-gray-900 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800">Review AI content</p>
              <p className="text-xs text-amber-700">
                Please verify all AI-generated information for accuracy, especially pricing,
                location, and amenities.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 px-4 pt-4 pb-2">
              Edit sections
            </p>
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setActiveSection(s)}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3 text-sm font-medium border-t border-gray-100 transition-colors',
                  activeSection === s
                    ? 'text-figma-navy bg-figma-navy/5 font-bold'
                    : 'text-gray-700 hover:bg-gray-50',
                )}
              >
                {s}
                <ChevronRight className="w-4 h-4" />
              </button>
            ))}
          </div>
        </aside>
      </div>

      <div className="fixed bottom-0 left-0 w-full z-50 flex justify-between items-center px-6 md:px-16 lg:px-20 py-5 bg-white border-t border-gray-200 shadow-lg">
        <button
          type="button"
          onClick={() => router.push('/host/listings')}
          className="px-6 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all active:scale-95"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-lg px-8 py-2.5 text-sm font-bold text-white bg-figma-navy hover:bg-figma-navy/90 transition-all active:scale-95 shadow-sm"
        >
          {isMulti ? `Save & Continue to Publish (${listings.length})` : 'Save Changes and Continue'}
        </button>
      </div>
      <div className="h-20" />
    </AiFlowShell>
  );
}
