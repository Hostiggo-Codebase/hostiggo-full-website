// Local-only state for the AI-import flow (Setup -> Processing -> Review ->
// Publish). Kept separate from ListingDraftContext (used by the manual
// wizard) since these are import-source fields (source URL, iCal link,
// per-import toggles) that have no column to persist into and aren't part
// of what actually gets sent to createListing.
//
// Processing calls the real AI-lister backend (github.com/Hostiggo-Codebase/
// AI-lister, deployed on Railway) via /api/host/ai-import/jobs -- see
// src/lib/services/aiLister.ts and ai/processing/page.tsx.

export type AiListingImport = {
  airbnbUrl: string;
  importAllPhotosA: boolean; // literal duplicate toggle, matches the provided design
  importAllPhotosB: boolean;
};

export type AiImportDraft = {
  listings: AiListingImport[];
  multiMode: boolean;
};

const STORAGE_KEY = 'hostiggo:ai-listing-import';

export const emptyImport = (): AiListingImport => ({
  airbnbUrl: '',
  importAllPhotosA: true,
  importAllPhotosB: true,
});

export function loadAiImportDraft(): AiImportDraft {
  if (typeof window === 'undefined') return { listings: [emptyImport()], multiMode: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { listings: [emptyImport()], multiMode: false };
}

export function saveAiImportDraft(draft: AiImportDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function clearAiImportDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// The AI-generated listing content a host reviews/edits before publishing.
// Populated by Processing from the real AI-lister job result. One of these
// per source URL -- Review/Publish always work over an array (a single
// import is just an array of length 1), so the single- and multi-listing
// paths share one code path instead of branching.
export type AiGeneratedListing = {
  // Which Setup row this came from -- lets Review label tabs and lets a
  // re-import attempt find the right slot to replace.
  sourceUrl: string;
  title: string;
  description: string;
  numGuests: number;
  numBedrooms: number;
  numBeds: number;
  numBathrooms: number;
  // DB amenity_id[], fuzzy-matched from `amenityLabels` at import time and
  // then editable by the host in the review screen.
  amenityIds: number[];
  // Raw free-text amenity names the source site listed, kept for display
  // ("detected from source") and re-matching.
  amenityLabels: string[];
  priceWeekday: number;
  priceWeekend: number;
  photosImported: number;
  amenitiesFound: number;
  aiScore: number;
  // Photo URLs re-hosted into our own "homestay photos" bucket (only ones
  // that mirrored successfully -- source photos we couldn't fetch/convert
  // are dropped rather than linking back to the original site).
  photoUrls: string[];
  // Location captured from the AI job, adjustable in review.
  latitude?: number;
  longitude?: number;
  locationId?: number;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  // Source property/room type strings (mapped to our enums at publish).
  propertyType?: string;
  roomType?: string;
  stayType?: 'entire' | 'private' | 'shared';
  houseRules?: {
    check_in_time?: string;
    check_out_time?: string;
    smoking_allowed?: boolean;
    pets_allowed?: boolean;
    parties_allowed?: boolean;
    quiet_hours?: boolean;
  };
};

// A source URL that failed to import -- kept alongside the successful ones
// so Review/Publish can show "3 of 4 imported, 1 failed" instead of
// silently dropping it.
export type FailedImport = {
  sourceUrl: string;
  error: string;
};

const GENERATED_LIST_KEY = 'hostiggo:ai-listing-generated-list';
const FAILED_LIST_KEY = 'hostiggo:ai-listing-failed-list';

export function loadGeneratedListings(): AiGeneratedListing[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GENERATED_LIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGeneratedListings(listings: AiGeneratedListing[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GENERATED_LIST_KEY, JSON.stringify(listings));
  } catch {
    /* ignore */
  }
}

export function clearGeneratedListings(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(GENERATED_LIST_KEY);
  } catch {
    /* ignore */
  }
}

export function loadFailedImports(): FailedImport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAILED_LIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFailedImports(failed: FailedImport[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FAILED_LIST_KEY, JSON.stringify(failed));
  } catch {
    /* ignore */
  }
}

export function clearFailedImports(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(FAILED_LIST_KEY);
  } catch {
    /* ignore */
  }
}
