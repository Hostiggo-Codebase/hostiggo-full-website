'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

// The draft a host builds across the 9 wizard steps. Persisted to localStorage
// so it survives step navigation and reloads, then POSTed on Finish.
export type ListingDraft = {
  propertyType?: string;
  stayType?: string;
  title?: string;
  description?: string;
  priceWeekday?: number;
  priceWeekend?: number;
  numGuests?: number;
  numBedrooms?: number;
  numBeds?: number;
  numBathrooms?: number;
  amenityIds?: number[];
  addonSelections?: { addon_id: number; price: number; includes: string }[];
  discounts?: { discount_type: string; percent: number; enabled: boolean }[];
  houseRules?: {
    check_in_time?: string;
    check_out_time?: string;
    smoking_allowed?: boolean;
    pets_allowed?: boolean;
    parties_allowed?: boolean;
    // The real listing_house_rules.quiet_hours column is a plain boolean
    // flag ("quiet hours policy in effect"), not a time range -- the actual
    // from/to times the wizard collects have no backing column to persist
    // into, so they're kept as local UI state only.
    quiet_hours?: boolean;
  };
  photoUrls?: string[];
  cancellationPolicy?: 'flexible' | 'moderate' | 'strict';
  // Only meaningful when cancellationPolicy === 'strict' -- the fraction
  // (0-1) refunded when a guest cancels at/beyond the policy's partial-
  // refund window. Per-listing override of the platform default (50%, see
  // CANCELLATION_POLICY_DEFAULTS.strictPartialRefundPercent).
  strictPartialRefundPercent?: number;
  country?: string;
  addressLine1?: string;
  landmark?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  locationId?: number;
};

const STORAGE_KEY = 'hostiggo:listing-draft';

type Ctx = {
  draft: ListingDraft;
  update: (patch: Partial<ListingDraft>) => void;
  reset: () => void;
  submit: () => Promise<void>;
  submitting: boolean;
};

const ListingDraftContext = createContext<Ctx | undefined>(undefined);

export function ListingDraftProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { userId, isAuthenticated } = useAuth();
  const [draft, setDraft] = useState<ListingDraft>({});
  const [submitting, setSubmitting] = useState(false);

  // Hydrate from localStorage once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDraft(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const update = useCallback(
    (patch: Partial<ListingDraft>) => {
      setDraft((cur) => {
        // Merge against whatever is in storage too, so a step writing during the
        // post-reload hydration window can't clobber earlier steps' data.
        let stored: ListingDraft = {};
        try {
          stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch {
          /* ignore */
        }
        const next = { ...stored, ...cur, ...patch };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setDraft({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const submit = useCallback(async () => {
    if (!isAuthenticated || !userId) {
      toast('Please sign in to publish your listing.');
      router.push('/signin?redirect=/host/list/house-rules');
      return;
    }

    // Check if user has a phone number
    try {
      const userResponse = await api.getUser(userId);
      if (!userResponse?.phone) {
        toast.error('Please add a phone number to your profile before publishing listings.');
        router.push('/host/settings?tab=personal');
        return;
      }
    } catch (err) {
      console.error('Failed to check user profile:', err);
    }

    setSubmitting(true);
    try {
      const result = await api.createListing({ userId, ...draft });
      reset();
      if (result.warnings?.length) {
        toast.success('Listing created, but with some issues.');
        result.warnings.forEach((w) => toast.error(w));
      } else if (result.live === false) {
        toast.success('Listing saved. It goes live once your payout setup is complete.');
      } else {
        toast.success('Your listing is live!');
      }
      router.push('/host/listings?created=1');
    } catch (err) {
      console.error('[listing-draft] submit failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not create the listing.');
    } finally {
      setSubmitting(false);
    }
  }, [draft, userId, isAuthenticated, reset, router]);

  return (
    <ListingDraftContext.Provider value={{ draft, update, reset, submit, submitting }}>
      {children}
    </ListingDraftContext.Provider>
  );
}

export function useListingDraft(): Ctx {
  const ctx = useContext(ListingDraftContext);
  if (!ctx) throw new Error('useListingDraft must be used within ListingDraftProvider');
  return ctx;
}
