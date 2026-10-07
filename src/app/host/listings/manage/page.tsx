'use client';

import { formatINR } from '@/lib/format';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  ImageIcon,
  DollarSign,
  Percent,
  Package,
  Home,
  Shield,
  MapPinIcon,
  Building2,
  Pause,
  Trash2,
  ChevronRight,
  FileText,
  AlertCircle,
  Image,
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import HostDashboardShell from '../../_components/HostDashboardShell';
import { useAuth } from '@/context/AuthContext';
import HouseRulesForm from '@/components/features/HouseRulesForm';
import SafetyDetailsForm from '@/components/features/SafetyDetailsForm';
import AddonsForm from '@/components/features/AddonsForm';
import DiscountsForm from '@/components/features/DiscountsForm';
import ListingPhotosManager from '@/components/features/ListingPhotosManager';
import AmenitiesForm from '@/components/features/AmenitiesForm';
import ListingLocationMap from '@/components/features/ListingLocationMap';
import AddressSearch from '../../list/_components/AddressSearch';
import { reverseGeocode, resolveLocationId } from '@/lib/services/geocoding';
import { cn } from '@/lib/utils';
import { getStoredAccessToken } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type DelistStatus = {
  state: 'none' | 'pending' | 'delisted';
  delistRequestedAt: string | null;
  delistedAt: string | null;
  earliestDelistAt: string | null;
  upcomingBookings: number;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || getStoredAccessToken();
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

interface ListingDetails {
  listing_id: number;
  title: string;
  description: string;
  price_weekday: number;
  price_weekend: number;
  num_guests: number;
  num_bedrooms: number;
  num_beds: number;
  num_bathrooms: number;
  address_line1: string;
  address_line2: string;
  landmark: string;
  location_id: number;
  latitude?: number | null;
  longitude?: number | null;
  property_type_id: number;
  is_active?: boolean;
}

interface Location {
  location_id: number;
  state: string;
  district: string;
  lower_division_name: string;
  pincode: string;
}

type SectionType =
  | 'overview'
  | 'description'
  | 'pricing'
  | 'discounts'
  | 'addons'
  | 'house-rules'
  | 'safety'
  | 'location'
  | 'capacity'
  | 'amenities'
  | 'photos';

const SECTIONS: { id: SectionType; label: string; icon: React.ReactNode; group: 'main' | 'monetization' }[] = [
  { id: 'photos', label: 'Photos', icon: <Image className="w-5 h-5" />, group: 'main' },
  { id: 'overview', label: 'Listing Title', icon: <FileText className="w-5 h-5" />, group: 'main' },
  { id: 'description', label: 'Description', icon: <FileText className="w-5 h-5" />, group: 'main' },
  { id: 'capacity', label: 'Room & Capacity', icon: <Building2 className="w-5 h-5" />, group: 'main' },
  { id: 'amenities', label: 'Amenities', icon: <Home className="w-5 h-5" />, group: 'main' },
  { id: 'location', label: 'Location', icon: <MapPinIcon className="w-5 h-5" />, group: 'main' },
  { id: 'pricing', label: 'Base & Weekend Price', icon: <DollarSign className="w-5 h-5" />, group: 'monetization' },
  { id: 'discounts', label: 'Discounts', icon: <Percent className="w-5 h-5" />, group: 'monetization' },
  { id: 'addons', label: 'Add-ons', icon: <Package className="w-5 h-5" />, group: 'monetization' },
  { id: 'house-rules', label: 'House Rules', icon: <Home className="w-5 h-5" />, group: 'main' },
  { id: 'safety', label: 'Safety Details', icon: <Shield className="w-5 h-5" />, group: 'main' },
];

export default function ManageListingPage() {
  const { userId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = searchParams.get('id');

  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [delist, setDelist] = useState<DelistStatus | null>(null);
  const [formData, setFormData] = useState<ListingDetails | null>(null);
  const [activeSection, setActiveSection] = useState<SectionType>('overview');

  const loadDelistStatus = async () => {
    if (!listingId) return;
    try {
      const res = await fetch(`/api/host/listings/${encodeURIComponent(listingId)}/delist`, {
        headers: await authHeaders(),
      });
      if (!res.ok) return;
      const { data } = await res.json();
      setDelist(data);
    } catch {
      /* non-fatal: the page still works without the status banner */
    }
  };

  const loadListing = async () => {
    if (!listingId || !userId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/hotels/${encodeURIComponent(listingId)}?userId=${encodeURIComponent(userId)}`,
      );
      if (!res.ok) throw new Error('Failed to load listing');
      const { data } = await res.json();
      setListing(data);
      setFormData(data);
    } catch (err) {
      console.error('Failed to load listing:', err);
      toast.error('Failed to load listing details');
    } finally {
      setLoading(false);
    }
  };

  const loadLocations = async () => {
    setLocationsLoading(true);
    try {
      const res = await fetch('/api/locations');
      if (!res.ok) throw new Error('Failed to load locations');
      const { data } = await res.json();
      setLocations(data || []);
    } catch (err) {
      console.error('Failed to load locations:', err);
      toast.error('Failed to load locations');
    } finally {
      setLocationsLoading(false);
    }
  };

  useEffect(() => {
    if (!listingId || !userId) return;
    loadListing();
    loadLocations();
    loadDelistStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId, userId]);

  const handleSave = async () => {
    if (!formData || !listingId || !userId) {
      toast.error('Listing data missing');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/host/listings/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: parseInt(listingId),
          userId,
          title: formData.title,
          description: formData.description,
          price_weekday: formData.price_weekday,
          price_weekend: formData.price_weekend,
          num_guests: formData.num_guests,
          num_bedrooms: formData.num_bedrooms,
          num_beds: formData.num_beds,
          num_bathrooms: formData.num_bathrooms,
          location_id: formData.location_id,
          address_line1: formData.address_line1,
          address_line2: formData.address_line2,
          landmark: formData.landmark,
          latitude: formData.latitude,
          longitude: formData.longitude,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save listing');
      }

      toast.success('Listing updated successfully!');
      await loadListing();
    } catch (err) {
      console.error('Save error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePause = async () => {
    if (!listingId || !formData || !userId) return;
    setPausing(true);
    try {
      const res = await fetch('/api/host/listings/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: parseInt(listingId), isActive: !formData.is_active, userId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.code === 'PAYOUT_NOT_READY') {
          toast.error(body.error);
          router.push('/host/settings?tab=payouts');
          return;
        }
        throw new Error(body?.error || 'Failed to update listing status');
      }
      const { data } = await res.json();
      setFormData((prev) => (prev ? { ...prev, is_active: data.isActive } : prev));
      setListing((prev) => (prev ? { ...prev, is_active: data.isActive } : prev));
      toast.success(data.isActive ? 'Listing is now live!' : 'Listing paused');
    } catch (err) {
      console.error('Toggle pause error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update listing status');
    } finally {
      setPausing(false);
    }
  };

  // "Remove listing" no longer deletes anything. It records a delist
  // request; the listing stays live until the request is 24h old and every
  // upcoming booking has checked out, then a scheduled job hides it
  // (see /api/host/listings/[listingId]/delist). The confirmation is an
  // in-app dialog instead of the browser's native confirm().
  const handleRemove = async () => {
    if (!listingId) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/host/listings/${encodeURIComponent(listingId)}/delist`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Failed to submit removal request');
      setDelist(payload.data);
      setShowRemoveDialog(false);
      toast.success(
        payload.data?.upcomingBookings > 0
          ? 'Removal requested. Your listing stays live until your upcoming bookings are completed.'
          : 'Removal requested. Your listing will be delisted within 24 hours.',
      );
    } catch (err) {
      console.error('Remove listing error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to submit removal request');
    } finally {
      setRemoving(false);
    }
  };

  const handleCancelRemoval = async () => {
    if (!listingId) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/host/listings/${encodeURIComponent(listingId)}/delist`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Failed to cancel removal request');
      setDelist(payload.data);
      toast.success('Removal request cancelled. Your listing stays live.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel removal request');
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <HostDashboardShell active="listings">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-figma-navy" />
        </div>
      </HostDashboardShell>
    );
  }

  if (!listing) {
    return (
      <HostDashboardShell active="listings">
        <div className="text-center py-20">
          <p className="text-gray-500 mb-4">Listing not found</p>
          <Link href="/host/listings" className="text-figma-navy hover:underline">
            Back to Listings
          </Link>
        </div>
      </HostDashboardShell>
    );
  }

  const selectedLocation = locations.find((l) => l.location_id === formData?.location_id);

  return (
    <HostDashboardShell active="listings">
      <div className="min-h-screen flex flex-col bg-gray-50">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-40">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Listing</h1>
            <p className="text-sm text-gray-500 mt-1">{formData?.title || 'Loading...'}</p>
          </div>
          <div className="flex items-center gap-4">
            {formData && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100">
                <span className={cn('w-2 h-2 rounded-full', formData.is_active ? 'bg-green-500' : 'bg-gray-400')} />
                <span className="text-xs font-semibold text-gray-700">
                  {formData.is_active ? 'Live' : 'Paused'}
                </span>
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-figma-navy text-white rounded-lg font-semibold hover:bg-figma-navy/90 disabled:opacity-60 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="w-72 border-r border-gray-200 bg-white overflow-y-auto flex flex-col">
            {/* Listing Preview Card - Sticky */}
            <div className="sticky top-0 p-5 bg-gradient-to-b from-white to-gray-50 border-b border-gray-200 z-10">
              <div className="space-y-4">
                {/* Photo Preview */}
                <div className="aspect-video bg-gray-300 rounded-xl overflow-hidden shadow-sm">
                  <button
                    onClick={() => setActiveSection('photos')}
                    className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 transition-colors cursor-pointer group relative"
                  >
                    <div className="text-center">
                      <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2 group-hover:text-gray-600 transition-colors" />
                    </div>
                  </button>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base line-clamp-2">
                    {formData?.title || 'Untitled Listing'}
                  </h3>
                  <p className="text-xs text-gray-600 mt-2">
                    {selectedLocation?.district && selectedLocation?.state && (
                      <>
                        📍 {selectedLocation.district}, {selectedLocation.state}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                  <div>
                    <p className="text-xs text-gray-600">Base Price</p>
                    <p className="text-base font-bold text-figma-navy">
                      {formatINR(formData?.price_weekday)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Weekend</p>
                    <p className="text-base font-bold text-figma-navy">
                      {formatINR(formData?.price_weekend)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Section Navigation */}
            <nav className="p-3 space-y-1">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-3 rounded-lg transition-all text-left',
                    activeSection === section.id
                      ? 'bg-figma-navy/10 text-figma-navy'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className={activeSection === section.id ? 'text-figma-navy' : 'text-gray-500'}>
                      {section.icon}
                    </span>
                    <span className="font-medium text-sm">{section.label}</span>
                  </div>
                  {activeSection === section.id && (
                    <ChevronRight className="w-4 h-4 text-figma-navy" />
                  )}
                </button>
              ))}

              {/* Divider */}
              <div className="border-t border-gray-200" />

              {/* Listing Status Section */}
              <div className="space-y-1">
                <button
                  onClick={handleTogglePause}
                  disabled={pausing || removing}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Pause className="w-5 h-5" />
                  <span className="font-medium text-sm">
                    {pausing ? 'Updating...' : formData?.is_active ? 'Pause listing' : 'Reactivate listing'}
                  </span>
                </button>
                {delist?.state === 'pending' ? (
                  <div className="mx-1 mt-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                    <p className="font-semibold">Removal requested</p>
                    <p>
                      {delist.upcomingBookings > 0
                        ? `Stays live until your ${delist.upcomingBookings} upcoming booking${delist.upcomingBookings === 1 ? ' is' : 's are'} completed, then it will be delisted.`
                        : `Will be delisted after ${fmtDateTime(delist.earliestDelistAt)}.`}
                    </p>
                    <button
                      type="button"
                      onClick={handleCancelRemoval}
                      disabled={removing}
                      className="font-semibold text-figma-navy hover:underline disabled:opacity-60"
                    >
                      {removing ? 'Updating...' : 'Cancel removal request'}
                    </button>
                  </div>
                ) : delist?.state === 'delisted' ? (
                  <div className="mx-1 mt-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                    This listing was delisted on {fmtDateTime(delist.delistedAt)}. Contact support to restore it.
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRemoveDialog(true)}
                    disabled={removing || pausing}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-5 h-5" />
                    <span className="font-medium text-sm">Remove Listing</span>
                  </button>
                )}
              </div>
            </nav>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-12 max-w-4xl mx-auto w-full">
              <SectionRenderer
                section={activeSection}
                formData={formData}
                setFormData={setFormData}
                locations={locations}
                locationsLoading={locationsLoading}
                selectedLocation={selectedLocation}
                listingId={listingId ? parseInt(listingId) : 0}
              />
            </div>
          </div>
        </div>
      </div>
      <AlertDialog open={showRemoveDialog} onOpenChange={(o) => !removing && setShowRemoveDialog(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this listing?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-gray-600">
                <p>We&apos;ll record your removal request. Nothing is deleted right away.</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <strong>No upcoming bookings:</strong> the listing is delisted within 24 hours.
                  </li>
                  <li>
                    <strong>Upcoming bookings:</strong> the listing stays live and bookable until all of
                    them are completed, then it is delisted.
                  </li>
                </ul>
                {delist && delist.upcomingBookings > 0 && (
                  <p className="font-medium text-gray-800">
                    This listing currently has {delist.upcomingBookings} upcoming booking
                    {delist.upcomingBookings === 1 ? '' : 's'}.
                  </p>
                )}
                <p>
                  You can cancel the request any time before it takes effect.{' '}
                  <Link href="/help/delisting" className="text-figma-navy underline">
                    How delisting works
                  </Link>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep listing</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRemove();
              }}
              disabled={removing}
              className="bg-red-600 hover:bg-red-700"
            >
              {removing ? 'Submitting…' : 'Request removal'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </HostDashboardShell>
  );
}


/**
 * Render the appropriate section based on activeSection
 */
function SectionRenderer({
  section,
  formData,
  setFormData,
  locations,
  locationsLoading,
  selectedLocation,
  listingId,
}: {
  section: SectionType;
  formData: any;
  setFormData: any;
  locations: any[];
  locationsLoading: boolean;
  selectedLocation: any;
  listingId: number;
}) {
  const inputClasses = 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-figma-navy outline-none text-base';
  const labelClasses = 'block text-sm font-semibold text-gray-700 mb-2';

  const sectionConfig: Record<SectionType, { title: string; description: string }> = {
    photos: {
      title: 'Photos',
      description: 'Upload and manage your listing photos. A good photo gallery increases bookings.',
    },
    overview: {
      title: 'Listing Title',
      description: 'Give your listing a clear, attractive title that stands out',
    },
    description: {
      title: 'Description',
      description: 'Tell guests about your property in detail - what makes it special',
    },
    pricing: {
      title: 'Base & Weekend Price',
      description: 'Set your nightly rates for weekdays and weekends',
    },
    discounts: {
      title: 'Discounts',
      description: 'Offer discounts to encourage longer stays and bookings',
    },
    addons: {
      title: 'Add-ons',
      description: 'Offer additional services for extra income',
    },
    'house-rules': {
      title: 'House Rules',
      description: 'Set clear expectations and guidelines for your guests',
    },
    safety: {
      title: 'Safety Details',
      description: 'Highlight safety features and build trust with guests',
    },
    location: {
      title: 'Location',
      description: 'Help guests find your property with address details',
    },
    capacity: {
      title: 'Room & Capacity',
      description: 'Define your property specifications and room details',
    },
    amenities: {
      title: 'Amenities',
      description: 'Tell guests what your place offers. Guests filter by these.',
    },
  };

  const config = sectionConfig[section];

  return (
    <div className="space-y-8">
      <div className="border-b border-gray-200 pb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">{config.title}</h2>
        <p className="text-base text-gray-600">{config.description}</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-6 shadow-sm">
        {section === 'photos' && listingId ? (
          <ListingPhotosManager listingId={listingId} />
        ) : null}

        {section === 'amenities' && listingId ? (
          <AmenitiesForm listingId={listingId} />
        ) : null}

        {section === 'overview' && (
          <div>
            <label className={labelClasses}>Listing Title</label>
            <input
              type="text"
              value={formData?.title || ''}
              onChange={(e) =>
                setFormData((prev: any) => prev ? { ...prev, title: e.target.value } : null)
              }
              className={inputClasses}
              placeholder="e.g., Cozy Studio in Downtown"
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-2">
              {formData?.title?.length || 0} / 100 characters
            </p>
          </div>
        )}

        {section === 'description' && (
          <div>
            <label className={labelClasses}>Description</label>
            <textarea
              value={formData?.description || ''}
              onChange={(e) =>
                setFormData((prev: any) => prev ? { ...prev, description: e.target.value } : null)
              }
              rows={8}
              className={cn(inputClasses, 'resize-none')}
              placeholder="Describe your listing, amenities, and what makes it special..."
              maxLength={5000}
            />
            <p className="text-xs text-gray-500 mt-2">
              {formData?.description?.length || 0} / 5000 characters
            </p>
          </div>
        )}

        {section === 'pricing' && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClasses}>Weekday Price (₹/night)</label>
              <input
                type="number"
                value={formData?.price_weekday || 0}
                onChange={(e) =>
                  setFormData((prev: any) =>
                    prev ? { ...prev, price_weekday: parseInt(e.target.value) || 0 } : null
                  )
                }
                className={inputClasses}
                min="0"
              />
            </div>
            <div>
              <label className={labelClasses}>Weekend Price (₹/night)</label>
              <input
                type="number"
                value={formData?.price_weekend || 0}
                onChange={(e) =>
                  setFormData((prev: any) =>
                    prev ? { ...prev, price_weekend: parseInt(e.target.value) || 0 } : null
                  )
                }
                className={inputClasses}
                min="0"
              />
            </div>
          </div>
        )}

        {section === 'discounts' && listingId ? (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800">
                Offer discounts for longer stays to boost bookings and occupancy rates.
              </p>
            </div>
            <DiscountsForm listingId={listingId} />
          </div>
        ) : null}

        {section === 'addons' && listingId ? (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800">
                Offer extra services like airport transfers, breakfast, or cleaning for additional revenue per booking.
              </p>
            </div>
            <AddonsForm listingId={listingId} />
          </div>
        ) : null}

        {section === 'house-rules' && listingId ? (
          <HouseRulesForm listingId={listingId} />
        ) : null}

        {section === 'safety' && listingId ? (
          <SafetyDetailsForm listingId={listingId} />
        ) : null}

        {section === 'location' && (
          <LocationSection
            formData={formData}
            setFormData={setFormData}
            locations={locations}
            locationsLoading={locationsLoading}
            selectedLocation={selectedLocation}
            inputClasses={inputClasses}
            labelClasses={labelClasses}
          />
        )}

        {section === 'capacity' && (
          <div className="grid grid-cols-2 gap-6">
            {[
              { label: 'Max Guests', key: 'num_guests' },
              { label: 'Bedrooms', key: 'num_bedrooms' },
              { label: 'Total Beds', key: 'num_beds' },
              { label: 'Bathrooms', key: 'num_bathrooms' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className={labelClasses}>{label}</label>
                <input
                  type="number"
                  value={formData?.[key as keyof typeof formData] || 0}
                  onChange={(e) =>
                    setFormData((prev: any) =>
                      prev
                        ? {
                            ...prev,
                            [key]: parseInt(e.target.value) || 0,
                          }
                        : null
                    )
                  }
                  className={inputClasses}
                  min="0"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Location editing for an existing listing. The host types/picks their
 * address (AddressSearch, backed by Google Places autocomplete) and the
 * coordinates, curated location_id, and displayed detected area are all
 * derived from that automatically -- previously this required manually
 * cross-referencing a plain <select> of every curated location by hand,
 * with no coordinates captured at all. The curated-location dropdown is
 * kept as a fallback/override for the rare address that doesn't resolve
 * to a match, same as the listing-creation wizard's location step.
 */
function LocationSection({
  formData,
  setFormData,
  locations,
  locationsLoading,
  selectedLocation,
  inputClasses,
  labelClasses,
}: {
  formData: any;
  setFormData: any;
  locations: any[];
  locationsLoading: boolean;
  selectedLocation: any;
  inputClasses: string;
  labelClasses: string;
}) {
  const [detecting, setDetecting] = useState(false);

  const handleAddressSelect = async (lat: number, lng: number, addr: string) => {
    setFormData((prev: any) =>
      prev ? { ...prev, address_line1: addr, latitude: lat, longitude: lng } : null,
    );
    setDetecting(true);
    try {
      const result = await reverseGeocode(lat, lng);
      if (!result) return;
      const locationId = await resolveLocationId(result.address.city, result.address.county);
      if (locationId) {
        setFormData((prev: any) => (prev ? { ...prev, location_id: locationId } : null));
      }
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <ListingLocationMap
        latitude={formData?.latitude}
        longitude={formData?.longitude}
        heightClass="h-56"
      />

      <div>
        <label className={labelClasses}>Address</label>
        <AddressSearch
          value={formData?.address_line1 || ''}
          onChange={(addr) =>
            setFormData((prev: any) => (prev ? { ...prev, address_line1: addr } : null))
          }
          onSelect={handleAddressSelect}
          placeholder="Start typing the property address"
        />
        <p className="text-xs text-gray-500 mt-1.5">
          {detecting
            ? 'Detecting location…'
            : 'Pick a suggestion and the location below is filled in automatically.'}
        </p>
      </div>

      {selectedLocation ? (
        <div className="p-4 bg-figma-navy/5 rounded-lg border border-figma-navy/30">
          <p className="text-sm font-semibold text-figma-navy mb-2">📍 Detected Location</p>
          <div className="space-y-1 text-sm text-figma-navy">
            <p><strong>State:</strong> {selectedLocation.state}</p>
            <p><strong>District:</strong> {selectedLocation.district}</p>
            <p><strong>Area:</strong> {selectedLocation.lower_division_name}</p>
            <p><strong>Pincode:</strong> {selectedLocation.pincode}</p>
          </div>
        </div>
      ) : (
        formData?.latitude != null &&
        formData?.longitude != null && (
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-sm text-amber-800">
              Coordinates detected, but this address doesn&apos;t match a curated
              location yet -- pick the closest one below.
            </p>
          </div>
        )
      )}

      <div>
        <label className={labelClasses}>
          Location {formData?.latitude != null ? '(auto-detected -- adjust if needed)' : ''}
        </label>
        <select
          value={formData?.location_id || ''}
          onChange={(e) => {
            const locId = parseInt(e.target.value);
            setFormData((prev: any) => (prev ? { ...prev, location_id: locId } : null));
          }}
          disabled={locationsLoading}
          className={cn(inputClasses, 'bg-white')}
        >
          <option value="">
            {locationsLoading ? 'Loading locations...' : 'Select a location'}
          </option>
          {locations.map((loc) => (
            <option key={loc.location_id} value={loc.location_id}>
              {loc.state} • {loc.district} • {loc.lower_division_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClasses}>Address Line 2 (Optional)</label>
        <input
          type="text"
          value={formData?.address_line2 || ''}
          onChange={(e) =>
            setFormData((prev: any) =>
              prev ? { ...prev, address_line2: e.target.value } : null,
            )
          }
          className={inputClasses}
          placeholder="Apt, suite, etc."
        />
      </div>

      <div>
        <label className={labelClasses}>Landmark (Optional)</label>
        <input
          type="text"
          value={formData?.landmark || ''}
          onChange={(e) =>
            setFormData((prev: any) => (prev ? { ...prev, landmark: e.target.value } : null))
          }
          className={inputClasses}
          placeholder="e.g., Near Central Park"
        />
      </div>
    </div>
  );
}
