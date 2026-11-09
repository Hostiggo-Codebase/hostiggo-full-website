export interface Destination {
  id: string;
  name: string;
  state: string;
  stayCount: number;
  imageUrl: string;
}

export interface GuestCount {
  adults: number;
  children: number;
  rooms: number;
  pets: boolean;
}

export interface AmenityItem {
  name: string;
  icon: string;
  available: boolean;
}

export interface Review {
  id: string;
  userName: string;
  userAvatar: string;
  rating: number;
  reviewText: string;
  reviewDate: string;
}

export interface Host {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  tripsHosted: number;
  joinDate: string;
  bio?: string;
  responseRate?: number;
  responseTime?: string;
  isSuperhost?: boolean;
  occupation?: string;
  hobbies?: string;
}

export interface Property {
  id: string;
  propertyName: string;
  city: string;
  state: string;
  price: number;
  priceWeekend?: number;
  originalPrice?: number;
  rating: number;
  reviewCount: number;
  amenities: string[];
  amenityDetails?: AmenityItem[];
  propertyType: string;
  images: string[];
  maxGuests: number;
  beds?: number;
  bedrooms?: number;
  bathrooms?: number;
  isFavorite?: boolean;
  isNew?: boolean;
  distanceFromCenter?: string;
  isInstantBook?: boolean;
  freeCancellation?: boolean;
  cancellationPolicy?: "flexible" | "moderate" | "strict";
  // Only meaningful when cancellationPolicy === "strict" -- per-listing
  // override of CANCELLATION_POLICY_DEFAULTS.strictPartialRefundPercent.
  // Undefined means this listing uses the platform default (50%).
  strictPartialRefundPercent?: number;
  breakfast?: boolean;
  parking?: boolean;
  wifi?: boolean;
  ac?: boolean;
  pool?: boolean;
  kitchen?: boolean;
  balcony?: boolean;
  mountainView?: boolean;
  bedType?: string;
  description?: string;
  coordinates?: { lat: number; lng: number };
  host?: Host;
  reviews?: Review[];
  houseRules?: string[];
  safetyFeatures?: { name: string; icon: string; description: string }[];
  activeDiscount?: { type: string; percent: number } | null;
  addons?: {
    addonId: number;
    name: string;
    icon: string;
    category: string;
    price: number;
    includes: string;
    timingFrom: string | null;
    timingTo: string | null;
    notes: string | null;
  }[];
  address?: string;
  nearbyLandmarks?: { name: string; distance: string }[];
}

export interface SearchFilters {
  priceMin: number;
  priceMax: number;
  guestRating: number | null;
  propertyTypes: string[];
  stayTypes: string[];
  amenities: string[];
  bedTypes: string[];
  freeCancellation: boolean;
  breakfast: boolean;
  parking: boolean;
  wifi: boolean;
  ac: boolean;
  privateRoom: boolean;
  sharedRoom: boolean;
  doubleBed: boolean;
  coupleFriendly: boolean;
  familyFriendly: boolean;
}

export type SortOption =
  | "recommended"
  | "price_asc"
  | "price_desc"
  | "top_rated"
  | "most_popular"
  | "newest"
  | "best_value";
