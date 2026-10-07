"use client";

import DateRangePicker from "@/components/features/DateRangePicker";
import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";
import { useAuth } from "@/context/AuthContext";
import { useWishlist } from "@/hooks/useWishlist";
import { api, ApiError, mapListingToProperty } from "@/lib/api";
import { track } from "@/lib/analytics";
import { calculateBookingInvoice } from "@/lib/billing/invoice";
import { CANCELLATION_POLICY_DEFAULTS } from "@/lib/billing/refund";
import { loadGoogleMaps } from "@/lib/services/googleMaps";
import { cn, toISODate } from "@/lib/utils";
import { BOOKINGS_OPEN } from "@/lib/booking-config";
import { formatINR, reviewMonth } from "@/lib/format";
import { UserAvatar } from "@/components/ui/user-avatar";
import { RazorpayUnavailableError } from "@/lib/services/razorpayCheckout";
import type { Host, Property, Review } from "@/types";
import { openRazorpayCheckout } from '@/lib/services/razorpayCheckout';
import WishlistPicker from '@/components/features/WishlistPicker';
import {
  AlertTriangle,
  ArrowUpDown,
  Award,
  Bath,
  BedDouble,
  BriefcaseMedical,
  CalendarDays,
  Car,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Droplets,
  DoorOpen,
  Dumbbell,
  ExternalLink,
  Flame,
  Gamepad2,
  Grid3x3,
  Heart,
  MapPin,
  MessageSquare,
  Microwave,
  Mountain,
  ParkingCircle,
  PawPrint,
  Share2,
  Shield,
  ShieldAlert,
  Snowflake,
  Star,
  Trees,
  Tv,
  Users,
  UtensilsCrossed,
  Waves,
  WashingMachine,
  Wifi,
  Wind,
  X,
  Zap,
  Filter
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { recordRecentlyViewed } from "@/lib/recentlyViewed";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { blockedStayDates } from "@/lib/stayDates";
import { toast } from "sonner";

const FALLBACK = "/placeholder.svg";

// Shared "Share" button handler for the property page (used by both the
// header Share button and the sticky-bar one). Previously this just fired
// `navigator.clipboard.writeText(...)` without awaiting or catching it --
// on browsers/contexts that deny clipboard-write permission (e.g. no user
// gesture, insecure context, or a strict permissions policy) that promise
// rejects and was never caught, showing an uncaught error in the console
// while the user got zero feedback either way (one call site even always
// toasted "Link copied!" regardless of whether the write actually
// succeeded). Now: try the native share sheet first when available, fall
// back to clipboard, and always resolve to a user-visible success or
// failure toast.
async function shareProperty(url: string, title?: string) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err: any) {
      // AbortError just means the user closed the native share sheet --
      // that's not a failure, so don't show an error toast for it.
      if (err?.name === "AbortError") return;
      // Fall through to the clipboard fallback for any other failure.
    }
  }

  try {
    if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(url);
    toast.success("Link copied!");
  } catch (err) {
    console.error("[property] share/copy link failed:", err);
    toast.error("Couldn't copy the link. Please copy it from your browser's address bar.");
  }
}

// Whether guests can book right now (see src/lib/booking-config.ts -- the
// server enforces the same switch). When closed, the page says so up front.
const BOOKING_DISABLED = !BOOKINGS_OPEN;

// ── Amenity Icon Map ─────────────────────────────────────────────────
// Keys are the `icon` values stored on the `amenities` table (plus a few
// legacy keys used by the name-based fallback in mapListingToProperty).
const AMENITY_ICON_MAP: Record<string, React.ReactNode> = {
  wifi: <Wifi className="w-5 h-5" />,
  "ac-unit": <Snowflake className="w-5 h-5" />,
  "local-fire-department": <Flame className="w-5 h-5" />,
  kitchen: <UtensilsCrossed className="w-5 h-5" />,
  "local-laundry-service": <WashingMachine className="w-5 h-5" />,
  "local-parking": <ParkingCircle className="w-5 h-5" />,
  tv: <Tv className="w-5 h-5" />,
  microwave: <Microwave className="w-5 h-5" />,
  pool: <Waves className="w-5 h-5" />,
  "fitness-center": <Dumbbell className="w-5 h-5" />,
  hot_tub: <Bath className="w-5 h-5" />,
  balcony: <DoorOpen className="w-5 h-5" />,
  elevator: <ArrowUpDown className="w-5 h-5" />,
  "smoke-detector": <ShieldAlert className="w-5 h-5" />,
  "medical-services": <BriefcaseMedical className="w-5 h-5" />,
  pets: <PawPrint className="w-5 h-5" />,
  shield: <Shield className="w-5 h-5" />,
  outdoor_grill: <Flame className="w-5 h-5" />,
  yard: <Trees className="w-5 h-5" />,
  "sports-esports": <Gamepad2 className="w-5 h-5" />,
  // legacy keys
  car: <Car className="w-5 h-5" />,
  coffee: <Coffee className="w-5 h-5" />,
  zap: <Zap className="w-5 h-5" />,
  droplets: <Droplets className="w-5 h-5" />,
  utensils: <UtensilsCrossed className="w-5 h-5" />,
  mountain: <Mountain className="w-5 h-5" />,
  wind: <Wind className="w-5 h-5" />,
};

// ── 1. Full-Screen Gallery Modal ─────────────────────────────────────
function GalleryModal({
  images,
  startIdx,
  onClose,
}: {
  images: string[];
  startIdx: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIdx);
  const touchStart = useRef<number | null>(null);

  const prev = useCallback(
    () => setIdx((i) => (i - 1 + images.length) % images.length),
    [images.length],
  );
  const next = useCallback(
    () => setIdx((i) => (i + 1) % images.length),
    [images.length],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, prev, next]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-white/70 text-sm font-medium">
          {idx + 1} / {images.length}
        </span>
        <button
          onClick={onClose}
          className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main image */}
      <div
        className="flex-1 relative flex items-center justify-center px-14 py-4 min-h-0"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchStart.current = e.changedTouches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchStart.current === null) return;
          const diff = touchStart.current - e.changedTouches[0].clientX;
          if (Math.abs(diff) > 50) diff > 0 ? next() : prev();
          touchStart.current = null;
        }}
      >
        <img
          key={idx}
          src={images[idx] || FALLBACK}
          alt={`Photo ${idx + 1}`}
          className="max-w-full max-h-full object-contain rounded-lg select-none"
          style={{ animation: "fadeIn 0.2s ease" }}
          draggable={false}
        />
        <button
          onClick={prev}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={next}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Thumbnail strip */}
      <div
        className="flex-shrink-0 px-5 pb-4 overflow-x-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-2 justify-center">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`View photo ${i + 1}`}
              className={cn(
                "w-14 h-10 rounded-md overflow-hidden flex-shrink-0 border-2 transition-all",
                i === idx
                  ? "border-white opacity-100 scale-105"
                  : "border-transparent opacity-50 hover:opacity-80",
              )}
            >
              <img
                src={img}
                alt={`Photo ${i + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 2. Image Gallery Grid ────────────────────────────────────────────
function ImageGallery({
  images,
  propertyName,
}: {
  images: string[];
  propertyName: string;
}) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStart, setGalleryStart] = useState(0);

  const open = (i: number) => {
    setGalleryStart(i);
    setGalleryOpen(true);
  };
  const imgs =
    images.length >= 5
      ? images
      : [...images, ...Array(5 - images.length).fill(FALLBACK)];

  return (
    <>
      {/* Grid: 1 large + 4 small */}
      <div
        className="relative rounded-2xl overflow-hidden mb-6"
        style={{ height: "clamp(260px, 44vw, 440px)" }}
      >
        <div className="grid grid-cols-2 grid-rows-2 gap-1.5 h-full">
          {/* Primary large image */}
          <div
            className="row-span-2 relative overflow-hidden cursor-pointer group"
            onClick={() => open(0)}
          >
            <Image
              src={imgs[0]}
              alt={`${propertyName} main`}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </div>

          {/* 4 small images */}
          <div className="grid grid-cols-2 gap-1.5 col-span-1 row-span-2">
            {imgs.slice(1, 5).map((src, i) => (
              <div
                key={i}
                className={cn(
                  "relative overflow-hidden cursor-pointer group",
                  i === 3 && "relative",
                )}
                onClick={() => open(i + 1)}
              >
                <Image
                  src={src}
                  alt={`${propertyName} ${i + 2}`}
                  fill
                  sizes="25vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                {/* "Show all" on last tile */}
                {i === 3 && images.length > 5 && (
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
                    <Grid3x3 className="w-5 h-5 mb-1" />
                    <span className="text-sm font-bold">
                      +{images.length - 5} more
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Show all button overlay */}
        <button
          onClick={() => open(0)}
          className="absolute bottom-3 right-3 bg-white hover:bg-gray-50 text-gray-800 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg border border-gray-200 transition-colors"
        >
          <Grid3x3 className="w-3.5 h-3.5" />
          Show all photos
        </button>
      </div>

      {galleryOpen && (
        <GalleryModal
          images={images}
          startIdx={galleryStart}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </>
  );
}

// ── 3. Property Map ──────────────────────────────────────────────────
function PropertyMap({ property }: { property: Property }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [loaded, setLoaded] = useState(false);

  const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
    "New Delhi": { lat: 28.6139, lng: 77.209 },
    Manali: { lat: 32.2396, lng: 77.1887 },
    Shimla: { lat: 31.1048, lng: 77.1734 },
    Jaipur: { lat: 26.9124, lng: 75.7873 },
    Bangalore: { lat: 12.9716, lng: 77.5946 },
    Rishikesh: { lat: 30.0869, lng: 78.2676 },
    Goa: { lat: 15.2993, lng: 74.124 },
    Dharamshala: { lat: 32.219, lng: 76.3234 },
    Kasol: { lat: 32.0109, lng: 77.313 },
    Kolkata: { lat: 22.5726, lng: 88.3639 },
  };

  const getCenter = () => {
    if (property.coordinates)
      return { lat: property.coordinates.lat, lng: property.coordinates.lng };
    for (const [name, coords] of Object.entries(CITY_CENTERS)) {
      if (property.city.toLowerCase().includes(name.toLowerCase()))
        return coords;
    }
    return { lat: 22.5937, lng: 78.9629 };
  };

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current || mapInstanceRef.current) return;

        const center = getCenter();

        const map = new google.maps.Map(mapRef.current, {
          center,
          zoom: 14,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });

        const marker = new google.maps.Marker({
          position: center,
          map,
          title: property.propertyName,
          icon: {
            path: "M12 2C7.58 2 4 5.58 4 10c0 5.25 8 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8zm0 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z",
            fillColor: "#ef4444",
            fillOpacity: 1,
            strokeWeight: 0,
            scale: 1.6,
            anchor: new google.maps.Point(12, 22),
          },
        });

        const infoWindow = new google.maps.InfoWindow({
          content: property.propertyName,
        });
        marker.addListener("click", () =>
          infoWindow.open({ map, anchor: marker }),
        );

        mapInstanceRef.current = map;
        markerRef.current = marker;
        setLoaded(true);
      })
      .catch((err) => {
        console.error("[PropertyMap] Failed to load Google Maps:", err);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.propertyName, property.coordinates]);

  const center = getCenter();

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl overflow-hidden border border-gray-100 relative"
        style={{ height: 280 }}
      >
        <div ref={mapRef} className="w-full h-full" />
        {!loaded && (
          <div className="absolute inset-0 bg-figma-navy/5 flex items-center justify-center">
            <div className="text-center">
              <div className="w-7 h-7 border-2 border-figma-navy/40 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-[12px] text-figma-navy font-medium">
                Loading map…
              </p>
            </div>
          </div>
        )}
      </div>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${center.lat},${center.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[12px] text-figma-navy hover:text-figma-navy/90 font-semibold transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        View on Google Maps
      </a>
    </div>
  );
}

// ── 5. Review Card ───────────────────────────────────────────────────
function ReviewCard({ review }: { review: Review }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.reviewText.length > 120;

  return (
    <div className="pb-5 border-b border-gray-100 last:border-0 last:pb-0">
      <div className="flex items-center gap-3 mb-2.5">
        <UserAvatar src={review.userAvatar} name={review.userName} size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-gray-800 leading-none">
            {review.userName}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {reviewMonth(review.reviewDate)}
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={cn(
                "w-3 h-3",
                i < review.rating
                  ? "text-amber-400 fill-amber-400"
                  : "text-gray-200 fill-gray-200",
              )}
            />
          ))}
        </div>
      </div>
      <p className="text-[13px] text-gray-600 leading-relaxed">
        {isLong && !expanded
          ? `${review.reviewText.slice(0, 120)}…`
          : review.reviewText}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[12px] text-gray-800 font-bold underline mt-1 hover:text-figma-navy transition-colors"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

// ── Write a review (signed-in guests) ────────────────────────────────
function WriteReview({
  listingId,
  onSubmitted,
}: {
  listingId: string;
  onSubmitted: (review: Review) => void;
}) {
  const { userId, user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="mt-5 pt-5 border-t border-gray-100 text-center">
        <p className="text-[13px] text-gray-500">
          <button
            onClick={() =>
              router.push(`/signin?redirect=/property/${listingId}`)
            }
            className="text-figma-navy font-bold hover:underline"
          >
            Sign in
          </button>{" "}
          to leave a review.
        </p>
      </div>
    );
  }

  const submit = async () => {
    if (!rating) {
      toast.error("Please pick a star rating.");
      return;
    }
    setSubmitting(true);
    try {
      await api.createReview({
        listingId,
        userId: userId!,
        rating,
        comment: comment.trim() || undefined,
      });
      onSubmitted({
        id: `local-${Date.now()}`,
        userName: user?.name || "Guest",
        userAvatar: user?.profile_pic_url || "",
        rating,
        reviewText: comment.trim(),
        reviewDate: new Date().toISOString(),
      });
      toast.success("Thanks for your review!");
      setRating(0);
      setComment("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not submit your review.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-5 pt-5 border-t border-gray-100">
      <p className="text-[13px] font-bold text-gray-800 mb-2">Write a review</p>
      <div className="flex items-center gap-1 mb-3">
        {Array.from({ length: 5 }).map((_, i) => {
          const v = i + 1;
          return (
            <button
              key={v}
              type="button"
              onMouseEnter={() => setHover(v)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(v)}
              aria-label={`${v} star${v > 1 ? "s" : ""}`}
            >
              <Star
                className={cn(
                  "w-6 h-6 transition-colors",
                  (hover || rating) >= v
                    ? "text-amber-400 fill-amber-400"
                    : "text-gray-200 fill-gray-200",
                )}
              />
            </button>
          );
        })}
      </div>
      <textarea
        rows={3}
        maxLength={500}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share a few words about your stay (optional)…"
        className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none text-[13px] resize-none"
      />
      <div className="flex justify-end mt-2">
        <button
          onClick={submit}
          disabled={submitting}
          className="px-6 py-2.5 bg-figma-navy text-white rounded-xl font-bold text-[13px] hover:bg-figma-navy/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting…" : "Submit review"}
        </button>
      </div>
    </div>
  );
}

// ── 6. Host Card ─────────────────────────────────────────────────────
function HostCard({ host }: { host: Host }) {
  const { isAuthenticated, userId } = useAuth();
  const router = useRouter();

  const handleMessageHost = () => {
    if (!isAuthenticated || !userId) {
      toast.error("Please sign in to message the host");
      router.push(
        `/signin?redirect=${encodeURIComponent(window.location.href)}`,
      );
      return;
    }

    // Navigate to chat page with host ID as query parameter
    router.push(`/chat?hostId=${encodeURIComponent(host.id)}`);
  };

  return (
    <div
      className="bg-white rounded-2xl p-5"
      style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}
    >
      <h2 className="text-[15px] font-bold text-gray-800 mb-4">
        Meet your host
      </h2>
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <UserAvatar
            src={host.avatar}
            name={host.name}
            size={64}
            className="rounded-full border-2 border-white shadow-md"
          />
          {host.isSuperhost && (
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-rose-500 rounded-full flex items-center justify-center shadow">
              <Award className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-extrabold text-gray-800">
              {host.name}
            </h3>
            {host.isSuperhost && (
              <span className="text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Award className="w-2.5 h-2.5" /> Superhost
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span className="text-[12px] font-bold text-gray-700">
                {host.rating}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[12px] text-gray-500">
              <Users className="w-3 h-3" /> {host.tripsHosted} trips hosted
            </div>
            <div className="flex items-center gap-1 text-[12px] text-gray-500">
              <CalendarDays className="w-3 h-3" /> Joined {host.joinDate}
            </div>
          </div>
        </div>
      </div>

      {host.bio && (
        <p className="text-[13px] text-gray-600 leading-relaxed mt-3">
          {host.bio}
        </p>
      )}

      {(host.responseRate != null || host.responseTime) && (
        <div className="grid grid-cols-2 gap-3 mt-4">
          {host.responseRate != null && (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[11px] font-bold text-gray-600">
                  Response rate
                </span>
              </div>
              <p className="text-[14px] font-extrabold text-gray-800">
                {host.responseRate}%
              </p>
            </div>
          )}
          {host.responseTime && (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Clock className="w-3.5 h-3.5 text-figma-navy" />
                <span className="text-[11px] font-bold text-gray-600">
                  Response time
                </span>
              </div>
              <p className="text-[13px] font-bold text-gray-800 capitalize">
                {host.responseTime}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleMessageHost}
          className="flex-1 flex items-center justify-center gap-1.5 border border-gray-800 text-gray-800 hover:bg-gray-50 py-2.5 rounded-xl text-[13px] font-bold transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          Message Host
        </button>
      </div>
    </div>
  );
}

// ── 7. Suggested Properties (Horizontal scroll) ──────────────────────
function SuggestedStays({ current }: { current: Property }) {
  const router = useRouter();
  const [suggested, setSuggested] = useState<Property[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadSuggested = async () => {
      try {
        const rows = await api.hotels();
        if (!mounted) return;
        setSuggested(
          rows
            .map(mapListingToProperty)
            .filter(
              (p) =>
                p.id !== current.id &&
                (p.city === current.city ||
                  p.state === current.state ||
                  Math.abs(p.price - current.price) < 15000),
            )
            .slice(0, 8),
        );
      } catch (error) {
        console.error("[property] failed to load suggested stays:", error);
        if (mounted) setSuggested([]);
      }
    };

    loadSuggested();

    return () => {
      mounted = false;
    };
  }, [current.id, current.city, current.state, current.price]);

  if (suggested.length === 0) return null;

  return (
    <div
      className="bg-white rounded-2xl p-5"
      style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}
    >
      <h2 className="text-[15px] font-bold text-gray-800 mb-4">
        You might also like
      </h2>
      <div
        className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1"
        style={{ scrollbarWidth: "none" }}
      >
        {suggested.map((p) => (
          <div
            key={p.id}
            className="flex-shrink-0 w-[200px] bg-gray-50 rounded-xl overflow-hidden cursor-pointer group hover:-translate-y-0.5 transition-transform"
            style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}
            onClick={() => {
              router.push(`/property/${p.id}`);
              window.scrollTo(0, 0);
            }}
          >
            <div className="relative h-28 overflow-hidden">
              <Image
                src={p.images[0] || FALLBACK}
                alt={p.propertyName}
                fill
                sizes="200px"
                className="object-cover group-hover:scale-105 transition-transform duration-400"
              />
              {p.originalPrice && (
                <span className="absolute top-2 left-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  -
                  {Math.round(
                    ((p.originalPrice - p.price) / p.originalPrice) * 100,
                  )}
                  %
                </span>
              )}
            </div>
            <div className="p-2.5">
              <span className="text-[9px] font-bold text-figma-navy bg-figma-navy/5 px-1.5 py-0.5 rounded-full">
                {p.propertyType}
              </span>
              <p className="text-[11px] font-bold text-gray-800 mt-1 line-clamp-1">
                {p.propertyName}
              </p>
              <p className="text-[10px] text-gray-400 mb-1.5 line-clamp-1">
                {p.city}, {p.state}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                  <span className="text-[10px] font-bold text-gray-700">
                    {p.rating > 0 ? p.rating.toFixed(1) : "New"}
                  </span>
                </div>
                <div>
                  <span className="text-[12px] font-extrabold text-figma-navy/90">
                    ₹{Math.round(p.price / 1000)}k
                  </span>
                  <span className="text-[9px] text-gray-400">/night</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 8. Booking Widget ────────────────────────────────────────────────
function BookingWidget({
  property,
  onNightsChange,
  onGuestsChange,
  selectedAddonIds,
}: {
  property: Property;
  onNightsChange?: (n: number) => void;
  onGuestsChange?: (g: number) => void;
  selectedAddonIds: number[];
}) {
  const searchParams = useSearchParams();
  const { isAuthenticated, userId, user } = useAuth();
  const router = useRouter();

  // Seed dates from URL params (passed by search results)
  const paramCheckIn = searchParams.get("checkIn");
  const paramCheckOut = searchParams.get("checkOut");
  const toDate = (s: string | null) => (s ? new Date(s + "T00:00:00") : null);

  const [checkIn, setCheckIn] = useState<Date | null>(toDate(paramCheckIn));
  const [checkOut, setCheckOut] = useState<Date | null>(toDate(paramCheckOut));
  const [guests, setGuests] = useState(1);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());

  const [calendarRevision, setCalendarRevision] = useState(0);
  useCalendarSync(property.id, () => setCalendarRevision((value) => value + 1));

  // Fetch booked/unavailable dates so the calendar can grey them out up
  // front, instead of only telling the guest after they pick a range and
  // hit "Reserve".
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const start = new Date();
      const end = new Date();
      end.setMonth(end.getMonth() + 12);
      try {
        const res = await fetch(
          `/api/calendar?listingId=${property.id}&startDate=${toISODate(start)}&endDate=${toISODate(end)}`, { cache: "no-store" },
        );
        const json = await res.json();
        if (cancelled || !res.ok) return;
        const blocked = new Set<string>();
        for (const entry of json.data?.entries ?? []) {
          if (entry.is_available === false) blocked.add(entry.date);
        }
        for (const b of json.data?.bookings ?? []) {
          if (b.status_id !== 2) continue;
          const cur = new Date(b.start_date + "T00:00:00");
          const bookingEnd = new Date(b.end_date + "T00:00:00");
          while (cur < bookingEnd) {
            blocked.add(toISODate(cur)!);
            cur.setDate(cur.getDate() + 1);
          }
        }
        setBlockedDates(blocked);
      } catch {
        // Keep the last known blocks during a connection failure.
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [property.id, calendarRevision]);

  // The booking card is `sticky`, so it only sits near the top of the
  // viewport once the page has been scrolled. Opened before that (e.g.
  // right after landing on the page), the calendar renders in the card's
  // natural, far-down document position - off-screen below the fold, with
  // nothing prompting the guest to scroll for it. Scroll it into view
  // whenever it opens so it's never invisible.
  useEffect(() => {
    if (showPicker) {
      pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showPicker]);

  // 'idle' | 'checking' | 'available' | 'unavailable' | 'booking' | 'confirmed'
  const [status, setStatus] = useState<
    "idle" | "checking" | "available" | "unavailable" | "booking" | "confirming" | "confirmed"
  >(paramCheckIn && paramCheckOut ? "available" : "idle");
  const [unavailableReason, setUnavailableReason] = useState("");
  const selectedBlockedDates = checkIn && checkOut ? blockedStayDates(checkIn, checkOut, blockedDates) : [];
  const selectedBlocked = status !== "confirmed" && status !== "confirming" && selectedBlockedDates.length > 0;
  const selectedAddons = (property.addons ?? []).filter((a) =>
    selectedAddonIds.includes(a.addonId),
  );
  // Breakfast gets 5% GST, everything else selected gets 18% -- split the
  // selection by category so calculateBookingInvoice applies the right rate.
  const breakfastAddonsTotal = selectedAddons
    .filter((a) => a.category?.toLowerCase().includes("breakfast"))
    .reduce((sum, a) => sum + a.price, 0);
  const otherAddonsTotal = selectedAddons
    .filter((a) => !a.category?.toLowerCase().includes("breakfast"))
    .reduce((sum, a) => sum + a.price, 0);
  const addonsTotal = breakfastAddonsTotal + otherAddonsTotal;

  const nights =
    checkIn && checkOut
      ? Math.max(
          0,
          Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000),
        )
      : 0;

  useEffect(() => {
    onNightsChange?.(nights);
  }, [nights]);
  useEffect(() => {
    onGuestsChange?.(guests);
  }, [guests]);

  // Mirrors the server-side calc in createBooking(), weekend nights
  // (Fri/Sat) bill at priceWeekend, everything else at the weekday price,
  // so this preview matches what actually gets charged. Also tracks how
  // many nights fell at each rate so the breakdown label below can say
  // exactly what was charged instead of a flat "₹weekdayPrice × N nights"
  // that goes wrong (looks like a pricing bug) the moment a Fri/Sat night
  // is in the stay and bills at the weekend rate.
  const { subtotal, weekdayNights, weekendNights, checkInNightPrice } = (() => {
    if (!checkIn || !checkOut || nights === 0) {
      return {
        subtotal: property.price,
        weekdayNights: 0,
        weekendNights: 0,
        checkInNightPrice: property.price,
      };
    }
    const priceWeekend = property.priceWeekend ?? property.price;
    let sum = 0;
    let weekday = 0;
    let weekend = 0;
    const cur = new Date(checkIn);
    for (let i = 0; i < nights; i++) {
      const dow = cur.getDay();
      const isWeekend = dow === 5 || dow === 6;
      sum += isWeekend ? priceWeekend : property.price;
      if (isWeekend) weekend++;
      else weekday++;
      cur.setDate(cur.getDate() + 1);
    }
    const checkInDow = checkIn.getDay();
    const checkInNightPrice =
      checkInDow === 5 || checkInDow === 6 ? priceWeekend : property.price;
    return {
      subtotal: sum,
      weekdayNights: weekday,
      weekendNights: weekend,
      checkInNightPrice,
    };
  })();
  // Real GST/service-fee invoice from src/lib/billing/invoice.ts, replacing
  // the old flat 8%/12% estimate. `subtotal` (the weekend-aware sum across
  // every night of the stay) is the amount actually taxed, but which GST
  // slab applies is decided by the check-in night's own rate (declared
  // tariff), not by the summed total -- see calculateBookingInvoice.
  const invoice = calculateBookingInvoice({
    basePropertyPrice: subtotal,
    gstRateBasisPrice: checkInNightPrice,
    breakfastPrice: breakfastAddonsTotal,
    otherServicesPrice: otherAddonsTotal,
  });
  const serviceFee = invoice.hostiggoServiceFeePaise / 100;
  const total = invoice.grandTotalRupees;

  const handleDatesChange = (ci: Date | null, co: Date | null) => {
    setCheckIn(ci);
    setCheckOut(co);
    setStatus("idle");
    setUnavailableReason("");
    if (ci && co) setShowPicker(false);
  };

  const checkAvailability = async () => {
    if (!checkIn || !checkOut) return;
    if (selectedBlocked) {
      setStatus("unavailable");
      setUnavailableReason("These dates are blocked. Please choose different dates.");
      return;
    }
    const isoStart = toISODate(checkIn);
    const isoEnd = toISODate(checkOut);
    // Defense in depth: toISODate can only return null here if checkIn/
    // checkOut were somehow invalid despite the guard above -- never send
    // a malformed date to the API (it would otherwise interpolate as the
    // literal string "null" and fail confusingly server-side).
    if (!isoStart || !isoEnd) {
      toast.error("Please select valid check-in and check-out dates.");
      return;
    }
    setStatus("checking");
    setUnavailableReason("");
    try {
      const res = await fetch(
        `/api/bookings/check-availability?listingId=${property.id}&startDate=${isoStart}&endDate=${isoEnd}`,
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        setStatus("idle");
        toast.error(
          data.error ?? "Could not check availability. Please try again.",
        );
        return;
      }
      if (data.available) {
        setStatus("available");
      } else {
        setStatus("unavailable");
        setUnavailableReason(
          data.reason ?? "Property is not available on these dates.",
        );
      }
    } catch {
      setStatus("idle");
      toast.error("Could not check availability. Please try again.");
    }
  };

  const book = async () => {
    console.log('[DEBUG] book() called');
    console.log('[DEBUG] Environment check:', {
      NEXT_PUBLIC_PAYMENTS_ENABLED: process.env.NEXT_PUBLIC_PAYMENTS_ENABLED,
      BOOKINGS_OPEN,
      BOOKING_DISABLED
    });
    
    if (selectedBlocked) {
      setStatus("unavailable");
      setUnavailableReason("These dates are blocked. Please choose different dates.");
      return;
    }
    if (!isAuthenticated || !userId) {
      toast("Please sign in to book this stay.");
      const params = new URLSearchParams();
      if (checkIn) params.set("checkIn", toISODate(checkIn)!);
      if (checkOut) params.set("checkOut", toISODate(checkOut)!);
      const qs = params.toString();
      const returnTo = `/property/${property.id}${qs ? `?${qs}` : ""}`;
      router.push(`/signin?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }
    setStatus("booking");
    try {
      // Step 1: price the stay and open a Razorpay order -- no booking
      // exists yet at this point.
      const order = await api.reserveBooking({
        listingId: property.id,
        userId,
        startDate: toISODate(checkIn)!,
        endDate: toISODate(checkOut)!,
        numAdults: guests,
        numChildren: 0,
        addonIds: selectedAddonIds,
      });
      
      console.log('[DEBUG] Reserve booking response:', order);
      
      if (!order.paymentRequired) {
        setStatus('confirmed');
        toast.success('Booking confirmed!');

        if (order.booking?.booking_id) {
          router.push(`/booking-confirmation/${order.booking.booking_id}`);
        }
        return;
      }

      track("begin_checkout", {
        item_id: property.id,
        value: order.amountRupees,
        currency: "INR",
      });

      // Step 2: guest actually pays via the Razorpay Checkout widget.
      let payment;
      try {
        payment = await openRazorpayCheckout({
          key: order.razorpayKeyId,
          amount: order.amountPaise,
          currency: order.currency,
          order_id: order.razorpayOrderId,
          name: 'Hostiggo',
          description: property.propertyName,
          prefill: {
            name: user?.name ?? undefined,
            email: user?.email ?? undefined,
            contact: user?.phone ?? undefined,
          },
          theme: { color: '#0B2C4D' },
        });
      } catch (checkoutErr) {
        setStatus('available');
        if (checkoutErr instanceof RazorpayUnavailableError) {
          // Script blocked (ad-blocker, strict privacy mode, flaky network):
          // say so instead of leaving a button that silently does nothing.
          toast.error(
            "We couldn't open the payment window. Please disable ad-blockers for hostiggo.com or check your connection, then try again.",
            { duration: 8000 },
          );
        }
        // Otherwise the guest closed the widget without paying -- nothing
        // was created (see /api/bookings/reserve), so they can just retry.
        return;
      }

      // Step 3: the booking is only created after the payment signature is
      // verified server-side. From here on money has moved, so the guest is
      // never offered the pay button again: the Razorpay webhook finalizes
      // the same order independently if this call can't.
      setStatus('confirming');
      const confirmPayload = {
        razorpayOrderId: payment.razorpay_order_id,
        razorpayPaymentId: payment.razorpay_payment_id,
        razorpaySignature: payment.razorpay_signature,
      };
      let created: any = null;
      for (let attempt = 0; attempt < 3 && !created; attempt++) {
        try {
          created = await api.confirmBookingPayment(confirmPayload);
        } catch (confirmErr) {
          // The dates went to someone else while this guest was paying and the
          // payment has been refunded: final, not worth retrying or "don't pay again".
          if (confirmErr instanceof ApiError && confirmErr.code === 'PAYMENT_REFUNDED') {
            toast.error(confirmErr.message, { duration: 15000 });
            setStatus('idle');
            return;
          }
          console.error('[property] confirm-payment attempt failed:', confirmErr);
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      if (!created?.booking_id) {
        setStatus('confirmed');
        toast.warning(
          `Payment received (ID ${payment.razorpay_payment_id}). We're finishing your booking -- it will appear in My Trips within a few minutes. Please don't pay again.`,
          { duration: 15000 },
        );
        router.push('/my-memories');
        return;
      }
      setStatus('confirmed');
      track("purchase", {
        transaction_id: created.booking_id,
        item_id: property.id,
        value: order.amountRupees,
        currency: "INR",
      });
      toast.success('Booking confirmed!');
      router.push(`/booking-confirmation/${created.booking_id}`);
    } catch (err) {
      console.error("[property] booking failed:", err);
      if (err instanceof ApiError && err.code === "GUEST_ID_REQUIRED") {
        toast.error(err.message);
        router.push("/account/verification");
        setStatus("available");
        return;
      }
      toast.error(
        err instanceof Error ? err.message : "Could not complete the booking.",
      );
      setStatus("available");
    }
  };

  const formatDate = (d: Date | null) =>
    d
      ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      : "Add date";

  return (
    <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm w-full">
      {/* Price header */}
      <div className="flex items-baseline gap-2 mb-1">
        {property.originalPrice && (
          <span className="text-[13px] text-gray-400 line-through">
            {formatINR(property.originalPrice)}
          </span>
        )}
        <span className="text-[24px] font-extrabold text-figma-navy/90">
          {formatINR(property.price)}
        </span>
        <span className="text-[12px] text-gray-400">/night</span>
        {property.originalPrice && (
          <span className="ml-auto text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            {Math.round(
              ((property.originalPrice - property.price) /
                property.originalPrice) *
                100,
            )}
            % off
          </span>
        )}
      </div>
      {/* Discount badge, informational only. The booking price calc below
          doesn't apply this discount yet (that's a separate pricing-logic
          change), so it's shown honestly as a host-offered discount rather
          than baked into the displayed/charged price. */}
      <p className="text-[11px] font-bold text-emerald-600 mb-4 min-h-[14px]">
        {property.activeDiscount &&
          `🏷️ ${property.activeDiscount.percent}% off: ${property.activeDiscount.type.replace(/_/g, " ")}`}
      </p>

      {/* Date selector, displays selected dates, opens picker on click.
          Wrapped in `relative` so the absolutely-positioned dropdown-panel
          below anchors to this row instead of the sticky booking widget
          container (sticky also establishes a positioning context, which
          was making the calendar render detached/misplaced). */}
      <div className="relative">
        <div
          className="border border-gray-200 rounded-xl overflow-hidden mb-2 cursor-pointer hover:border-figma-navy/40 transition-colors"
          onClick={() => setShowPicker((v) => !v)}
        >
          <div className="grid grid-cols-2 divide-x divide-gray-200">
            <div className="p-2.5">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Check in
              </p>
              <p
                className={`text-[13px] font-semibold ${checkIn ? "text-gray-800" : "text-gray-400"}`}
              >
                {formatDate(checkIn)}
              </p>
            </div>
            <div className="p-2.5">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Check out
              </p>
              <p
                className={`text-[13px] font-semibold ${checkOut ? "text-gray-800" : "text-gray-400"}`}
              >
                {formatDate(checkOut)}
              </p>
            </div>
          </div>

          {/* Guests row */}
          <div
            className="border-t border-gray-200 p-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Guests
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setGuests((g) => Math.max(1, g - 1))}
                className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:border-gray-400 transition-colors text-sm"
              >
                −
              </button>
              <span className="flex-1 text-center text-[13px] font-bold text-gray-800">
                {guests} Guest{guests !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() =>
                  setGuests((g) => Math.min(property.maxGuests, g + 1))
                }
                className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:border-gray-400 transition-colors text-sm"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* DateRangePicker dropdown, anchored to the *right* edge of this
          narrow sidebar card. DateRangePicker overrides .dropdown-panel's
          default `position: absolute` with `!relative` and sets its own
          min(720px, 95vw) width, so this wrapper naturally shrink-to-fits
          around it and `right-0` correctly anchors the box's right edge. */}
        {showPicker && (
          <div
            className="absolute top-[calc(100%+8px)] right-0 z-50"
            style={{ scrollMarginTop: "90px" }}
            ref={pickerRef}
          >
            <DateRangePicker
              checkIn={checkIn}
              checkOut={checkOut}
              onChange={handleDatesChange}
              onClose={() => setShowPicker(false)}
              blockedDates={blockedDates}
            />
          </div>
        )}
      </div>

      {/* Unavailable message */}
      {(status === "unavailable" || selectedBlocked) && (
        <p role="alert" className="text-[11px] text-red-500 font-medium mb-2 flex items-center gap-1">
          <X className="w-3 h-3" /> {selectedBlocked ? "These dates are blocked. Please choose different dates." : unavailableReason}
        </p>
      )}

      {/* Price breakdown, only show when available/confirmed */}
      {nights > 0 &&
        (status === "available" ||
          status === "confirmed" ||
          status === "booking") && (
          <div className="mb-4 bg-gray-50 rounded-xl p-3 space-y-2 text-[12px]">
            <div className="flex justify-between text-gray-600">
              <span>
                {weekendNights === 0 || weekdayNights === 0 ? (
                  <>
                    {formatINR(
                      weekendNights > 0 ? (property.priceWeekend ?? property.price) : property.price,
                    )}{" "}
                    × {nights} night{nights > 1 ? "s" : ""}
                  </>
                ) : (
                  <>
                    {formatINR(property.price)} × {weekdayNights}{" "}
                    night{weekdayNights > 1 ? "s" : ""} +{" "}
                    {formatINR(property.priceWeekend ?? property.price)}{" "}
                    × {weekendNights} night{weekendNights > 1 ? "s" : ""}
                  </>
                )}
              </span>
              <span className="font-semibold">
                {formatINR(subtotal)}
              </span>
            </div>
            {selectedAddons.map((a) => (
              <div
                key={a.addonId}
                className="flex justify-between text-gray-600"
              >
                <span>{a.name}</span>
                <span className="font-semibold">
                  {formatINR(a.price)}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-gray-600">
              <span>
                GST on property ({(invoice.propertyGstRate * 100).toFixed(0)}%)
              </span>
              <span className="font-semibold">
                {formatINR((invoice.gstOnPropertyPaise / 100))}
              </span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>
                Hostiggo service fee (
                {(invoice.hostiggoServiceFeeRate * 100).toFixed(0)}%)
              </span>
              <span className="font-semibold">
                {formatINR(serviceFee)}
              </span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>GST on service fee (18%)</span>
              <span className="font-semibold">
                {formatINR(invoice.gstOnHostiggoServiceFeePaise / 100)}
              </span>
            </div>
            {invoice.breakfastGstPaise > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>GST on breakfast (5%)</span>
                <span className="font-semibold">
                  {formatINR((invoice.breakfastGstPaise / 100))}
                </span>
              </div>
            )}
            {invoice.otherServicesGstPaise > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>GST on other services (18%)</span>
                <span className="font-semibold">
                  {formatINR(invoice.otherServicesGstPaise / 100)}
                </span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-800 pt-2 border-t border-gray-200 text-[13px]">
              <span>Total</span>
              <span className="text-figma-navy/90">
                {formatINR(total)}
              </span>
            </div>
          </div>
        )}

      {/* CTA button */}
      {status === "confirmed" ? (
        <div className="w-full bg-emerald-500 text-white py-3 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2">
          <CheckCircle className="w-5 h-5" /> Booking confirmed!
        </div>
      ) : status === "confirming" ? (
        <div
          role="status"
          className="w-full bg-figma-navy/90 text-white py-3 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2"
        >
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Payment received -- confirming your booking…
        </div>
      ) : status === "available" || status === "booking" ? (
        // Bookings are temporarily disabled site-wide -- button stays
        // visible so the page layout/flow is unchanged, but is inert.
        BOOKING_DISABLED ? (
          <div className="w-full bg-gray-100 text-gray-400 py-3 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 cursor-not-allowed">
            <CalendarDays className="w-4 h-4" />
            Bookings are paused right now
          </div>
        ) : (
          <button
            onClick={book}
            disabled={status === "booking" || selectedBlocked}
            className="w-full bg-figma-navy hover:bg-figma-navy/90 active:bg-figma-navy text-white py-3 rounded-xl font-bold text-[14px] transition-colors shadow-md shadow-figma-navy/20 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CalendarDays className="w-4 h-4" />
            {status === "booking"
              ? "Booking…"
              : `Book for ${nights} Night${nights > 1 ? "s" : ""}`}
          </button>
        )
      ) : (
        <button
          onClick={
            checkIn && checkOut ? checkAvailability : () => setShowPicker(true)
          }
          disabled={status === "checking"}
          className="w-full bg-figma-navy hover:bg-figma-navy/90 active:bg-figma-navy text-white py-3 rounded-xl font-bold text-[14px] transition-colors shadow-md shadow-figma-navy/20 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <CalendarDays className="w-4 h-4" />
          {status === "checking"
            ? "Checking…"
            : checkIn && checkOut
              ? "Check Availability"
              : "Select Dates"}
        </button>
      )}

      <div className="flex flex-col gap-1 mt-3">
        {property.freeCancellation && (
          <p className="text-center text-[11px] text-emerald-600 font-semibold flex items-center justify-center gap-1">
            <CheckCircle className="w-3 h-3" /> Free cancellation available
          </p>
        )}
        {property.isInstantBook && (
          <p className="text-center text-[11px] text-figma-navy font-medium flex items-center justify-center gap-1">
            <Zap className="w-3 h-3" /> Instant confirmation
          </p>
        )}
      </div>
      <p className="text-center text-[10px] text-gray-400 mt-2">
        You won&apos;t be charged yet
      </p>
    </div>
  );
}

// ── Reviews Modal ───────────────────────────────────────────────────
const STAR_FILTERS = [
  { label: "All", value: 0 },
  { label: "5 stars", value: 5 },
  { label: "4 stars", value: 4 },
  { label: "3 stars", value: 3 },
  { label: "2 stars", value: 2 },
  { label: "1 star", value: 1 },
];

function ReviewsModal({
  reviews,
  rating,
  reviewCount,
  onClose,
}: {
  reviews: Review[];
  rating: number;
  reviewCount: number;
  onClose: () => void;
}) {
  const [starFilter, setStarFilter] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const filtered =
    starFilter === 0 ? reviews : reviews.filter((r) => r.rating === starFilter);

  const currentLabel =
    STAR_FILTERS.find((f) => f.value === starFilter)?.label ?? "All";

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg flex flex-col"
        style={{
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
          maxHeight: "82vh",
          animation: "modalSlideUp 0.22s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          {/* Rating badge */}
          <div className="flex items-center gap-1.5 bg-emerald-500 text-white px-2.5 py-1 rounded-lg">
            <Star className="w-3.5 h-3.5 fill-white" />
            <span className="text-[14px] font-extrabold">
              {rating > 0 ? rating.toFixed(1) : "New"}
            </span>
          </div>
          <div>
            <span className="text-[15px] font-extrabold text-gray-800">
              {reviewCount} reviews
            </span>
          </div>

          {/* Star filter dropdown */}
          <div className="relative ml-2">
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-[12px] font-semibold transition-all",
                filterOpen
                  ? "border-figma-navy/40 bg-figma-navy/5 text-figma-navy/90"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
              )}
            >
              {currentLabel}
              <ChevronDown
                className={cn(
                  "w-3 h-3 transition-transform",
                  filterOpen && "rotate-180",
                )}
              />
            </button>
            {filterOpen && (
              <div
                className="absolute top-full left-0 mt-1 bg-white rounded-xl border border-gray-100 py-1 z-10 min-w-[120px]"
                style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
              >
                {STAR_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => {
                      setStarFilter(f.value);
                      setFilterOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2 text-[13px] transition-colors flex items-center gap-2",
                      starFilter === f.value
                        ? "text-figma-navy font-semibold bg-figma-navy/5"
                        : "text-gray-700 hover:bg-gray-50",
                    )}
                  >
                    {f.value > 0 && (
                      <div className="flex gap-0.5">
                        {Array.from({ length: f.value }).map((_, i) => (
                          <Star
                            key={i}
                            className="w-2.5 h-2.5 text-amber-400 fill-amber-400"
                          />
                        ))}
                      </div>
                    )}
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Count badge */}
          {starFilter !== 0 && (
            <span className="text-[11px] text-gray-400 font-medium ml-1">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable reviews body */}
        <div
          ref={bodyRef}
          className="reviews-scroll flex-1 overflow-y-auto px-5 py-4 space-y-5"
        >
          {filtered.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-4xl mb-3">⭐</div>
              <p className="text-[14px] font-semibold text-gray-500">
                No {starFilter}-star reviews yet.
              </p>
              <button
                onClick={() => setStarFilter(0)}
                className="mt-3 text-[13px] text-figma-navy font-semibold underline"
              >
                Show all reviews
              </button>
            </div>
          ) : (
            filtered.map((review) => (
              <div
                key={review.id}
                className="pb-5 border-b border-gray-100 last:border-0 last:pb-0"
              >
                <div className="flex items-start gap-3 mb-2">
                  <UserAvatar src={review.userAvatar} name={review.userName} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] leading-none">
                      <span className="font-bold text-gray-800">
                        {review.userName}
                      </span>
                      <span className="text-gray-400 font-medium">
                        {" "}
                        &middot; {review.reviewDate}
                      </span>
                    </p>
                    <div className="flex items-center gap-0.5 mt-1.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "w-3 h-3",
                            i < review.rating
                              ? "text-amber-400 fill-amber-400"
                              : "text-gray-200 fill-gray-200",
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  {review.reviewText}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sticky Scroll Summary Bar ────────────────────────────────────────
function StickyBookingBar({
  property,
  nights,
  guests,
  onReserve,
  show,
  liked,
  userId,
  onSavedChange,
  onRequireSignIn,
}: {
  property: Property;
  nights: number;
  guests: number;
  onReserve: () => void;
  show: boolean;
  liked: boolean;
  userId: string | null;
  onSavedChange: (saved: boolean) => void;
  onRequireSignIn: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div
      className={cn(
        "fixed top-0 inset-x-0 z-[999] bg-white border-b border-gray-200 transition-all duration-300",
        show
          ? "translate-y-0 opacity-100"
          : "-translate-y-full opacity-0 pointer-events-none",
      )}
      style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.10)" }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
        {/* Reserve button -- just scrolls to the real booking widget below,
            so it follows the same site-wide disabled state for consistency. */}
        {BOOKING_DISABLED ? (
          <div className="bg-gray-100 text-gray-400 px-5 py-2 rounded-xl font-bold text-[13px] flex-shrink-0 cursor-not-allowed">
            Reserve
          </div>
        ) : (
          <button
            onClick={onReserve}
            className="bg-figma-navy hover:bg-figma-navy/90 text-white px-5 py-2 rounded-xl font-bold text-[13px] transition-colors shadow-sm flex-shrink-0"
          >
            Reserve
          </button>
        )}

        {/* Price + info */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[15px] font-extrabold text-gray-800">
            {formatINR(property.price)}
          </span>
          <span className="text-[12px] text-gray-400">/night</span>
          {nights > 0 && (
            <span className="text-[12px] text-gray-500 ml-2 font-medium">
              · for {nights} night{nights !== 1 ? "s" : ""}
            </span>
          )}
          {guests > 0 && (
            <span className="text-[12px] text-gray-500 font-medium">
              · {guests} Adult{guests !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => shareProperty(window.location.href, property.propertyName)}
            className="w-8 h-8 rounded-full border border-gray-200 hover:border-gray-300 bg-white flex items-center justify-center text-gray-500 hover:text-figma-navy transition-colors"
            title="Share"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
          <div className="relative">
            <button
              onClick={() => (userId ? setPickerOpen((v) => !v) : onRequireSignIn())}
              className={cn(
                'w-8 h-8 rounded-full border bg-white flex items-center justify-center transition-colors',
                liked
                  ? 'border-rose-300 text-rose-500'
                  : 'border-gray-200 hover:border-rose-300 text-gray-400 hover:text-rose-500',
              )}
              title="Save"
            >
              <Heart className={cn('w-3.5 h-3.5', liked && 'fill-rose-500')} />
            </button>
            {pickerOpen && userId && (
              <WishlistPicker
                userId={userId}
                listingId={property.id}
                onClose={() => setPickerOpen(false)}
                onSavedChange={onSavedChange}
                className="right-0 top-[calc(100%+6px)]"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────
export default function PropertyDetailsPage({ initialRow }: { initialRow?: any }) {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  // The server page already loaded the listing (and 404s when it's missing),
  // so the first render has real content -- no client round-trip.
  const [property, setProperty] = useState<Property | null>(() =>
    initialRow ? mapListingToProperty(initialRow) : null,
  );
  const [loading, setLoading] = useState(!initialRow);
  const [loadFailed, setLoadFailed] = useState(false);
  const viewedId = property?.id;
  useEffect(() => {
    if (viewedId) track("view_item", { item_id: viewedId });
  }, [viewedId]);
  const [reloadKey, setReloadKey] = useState(0);
  const { isAuthenticated, userId, user } = useAuth();
  const { isSaved } = useWishlist(userId);
  const [likedOverride, setLikedOverride] = useState<boolean | null>(null);
  const liked = likedOverride ?? (property ? isSaved(property.id) : false);
  const [savePickerOpen, setSavePickerOpen] = useState(false);
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [selectedAddonIds, setSelectedAddonIds] = useState<number[]>([]);
  const toggleAddon = (addonId: number) => {
    setSelectedAddonIds((prev) =>
      prev.includes(addonId)
        ? prev.filter((id) => id !== addonId)
        : [...prev, addonId],
    );
  };
  const [descExpanded, setDescExpanded] = useState(false);
  const [stickyBar, setStickyBar] = useState(false);
  const [barNights, setBarNights] = useState(0);
  const [barGuests, setBarGuests] = useState(1);
  const galleryRef = useRef<HTMLDivElement>(null);

  // Feed the wishlist page's "Recently viewed" section -- only once the
  // listing actually loaded, so a bad/removed id isn't recorded.
  useEffect(() => {
    if (property?.id) recordRecentlyViewed(property.id);
  }, [property?.id]);

  useEffect(() => {
    let mounted = true;

    const loadProperty = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      if (initialRow && String(initialRow.listing_id) === String(id) && reloadKey === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadFailed(false);
      try {
        const row = await api.propertyDetail(id);
        if (!mounted) return;
        const mapped = row ? mapListingToProperty(row) : null;
        setProperty(mapped);
      } catch (error) {
        console.error("[property] failed to load detail:", error);
        if (mounted) {
          setProperty(null);
          setLoadFailed(true);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadProperty();

    return () => {
      mounted = false;
    };
    // initialRow is fixed for the life of this page instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadKey]);

  // Next.js client-side navigation doesn't scroll to a URL hash the way a
  // full page load does, so a link like /property/74#write-review lands at
  // the top instead of the review form -- scroll to it manually once the
  // page (and therefore the target element) has actually rendered.
  useEffect(() => {
    if (
      loading ||
      !property ||
      typeof window === "undefined" ||
      !window.location.hash
    )
      return;
    const el = document.getElementById(window.location.hash.slice(1));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, property]);

  // Show sticky bar after scrolling past gallery
  useEffect(() => {
    const handleScroll = () => {
      const galleryBottom = galleryRef.current
        ? galleryRef.current.getBoundingClientRect().bottom
        : 500;
      setStickyBar(galleryBottom < 0);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-figma-cream">
        <Navbar />
        <div className="container-main py-6 max-w-6xl mx-auto px-4 sm:px-6">
          <div className="h-[440px] rounded-2xl bg-white animate-pulse mb-6" />
          <div className="h-8 w-2/3 rounded bg-white animate-pulse mb-4" />
          <div className="h-4 w-1/2 rounded bg-white animate-pulse" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-figma-cream">
        <Navbar />
        <div className="container-main py-20 text-center">
          <div className="text-6xl mb-4">🏨</div>
          <h1 className="text-2xl font-bold text-gray-700 mb-2">
            {loadFailed ? "We couldn't load this stay" : "This stay isn't available"}
          </h1>
          <p className="text-gray-500 mb-6">
            {loadFailed
              ? "Please check your connection and try again."
              : "It may have been removed or paused by the host."}
          </p>
          <button
            onClick={() => (loadFailed ? setReloadKey((k) => k + 1) : router.push("/search"))}
            className="bg-figma-navy text-white px-6 py-3 rounded-xl font-semibold hover:bg-figma-navy/90 transition-colors"
          >
            {loadFailed ? "Try again" : "Explore other stays"}
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  const images = property.images.length > 0 ? property.images : [FALLBACK];
  const amenities =
    property.amenityDetails ??
    property.amenities.map((a) => ({ name: a, icon: "check", available: true }));
  const visibleAmenities = showAllAmenities ? amenities : amenities.slice(0, 8);
  const reviews = property.reviews ?? [];
  const previewReviews = reviews.slice(0, 3);

  const handleReviewSubmitted = (review: Review) => {
    setProperty((current) => {
      if (!current) return current;
      const nextReviews = [review, ...(current.reviews ?? [])];
      const nextReviewCount = current.reviewCount + 1;
      return {
        ...current,
        reviews: nextReviews,
        reviewCount: nextReviewCount,
        rating: nextReviews.reduce((sum, item) => sum + item.rating, 0) / nextReviews.length,
      };
    });
  };

  const descIsLong = (property.description?.length ?? 0) > 200;

  return (
    <div className="min-h-screen bg-figma-cream">
      {/* Sticky booking summary bar */}
      <StickyBookingBar
        property={property}
        nights={barNights}
        guests={barGuests}
        onReserve={() =>
          document.getElementById("availability")?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        show={stickyBar}
        liked={liked}
        userId={isAuthenticated ? userId : null}
        onSavedChange={setLikedOverride}
        onRequireSignIn={() => router.push('/signin')}
      />

      <Navbar />

      {/* ── Sub-navigation Header ── */}
      <div className="sticky top-0 z-[40] bg-figma-cream border-b border-gray-200 hidden md:block">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div
            className="flex items-center gap-6 overflow-x-auto whitespace-nowrap py-4 text-[13px] font-bold text-gray-500"
            style={{ scrollbarWidth: "none" }}
          >
            <a
              href="#overview"
              className="text-gray-900 border-b-2 border-gray-900 pb-1 -mb-[18px]"
            >
              Overview
            </a>
            <a
              href="#facilities"
              className="hover:text-gray-900 transition-colors"
            >
              Facilities
            </a>
            <a
              href="#availability"
              className="hover:text-gray-900 transition-colors"
            >
              Availability
            </a>
            <a
              href="#location"
              className="hover:text-gray-900 transition-colors"
            >
              Location
            </a>
            <a
              href="#reviews"
              className="hover:text-gray-900 transition-colors"
            >
              Ratings & reviews
            </a>
            <a href="#addons" className="hover:text-gray-900 transition-colors">
              Add-ons
            </a>
            <a href="#rules" className="hover:text-gray-900 transition-colors">
              House rules
            </a>
          </div>
        </div>
      </div>

      <div className="container-main py-8 max-w-5xl mx-auto px-4 sm:px-6 space-y-10">
        {/* Title Section */}
        <div id="overview">
          <div className="flex flex-col md:flex-row md:items-start justify-between mb-4 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold text-figma-navy bg-figma-navy/5 px-2.5 py-0.5 rounded-full">
                  {property.propertyType}
                </span>
                {property.isInstantBook && (
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5" /> Instant Book
                  </span>
                )}
              </div>
              <h1 className="text-[30px] sm:text-[36px] font-semibold text-gray-900 leading-[128%] tracking-[0.003em] mb-2">
                {property.propertyName}
              </h1>
              <p className="text-type-poppins-regular-16-128-03 text-gray-500 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-figma-navy flex-shrink-0" />
                {property.city}, {property.state}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 md:mt-2">
              <button
                onClick={() => shareProperty(window.location.href, property.propertyName)}
                className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-sm text-[13px] font-bold"
              >
                <Share2 className="w-4 h-4" /> Share
              </button>
            <div className="relative">
              <button
                onClick={() => {
                  if (!isAuthenticated || !userId || !property) {
                    router.push("/signin");
                    return;
                  }
                  setSavePickerOpen((v) => !v);
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full border bg-white transition-colors shadow-sm text-[13px] font-bold",
                  liked
                    ? "border-rose-300 text-rose-500 bg-rose-50"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50",
                )}
              >
                <Heart className={cn("w-4 h-4", liked && "fill-rose-500")} />{" "}
                {liked ? "Saved" : "Save"}
              </button>
              {savePickerOpen && userId && property && (
                <WishlistPicker
                  userId={userId}
                  listingId={property.id}
                  onClose={() => setSavePickerOpen(false)}
                  onSavedChange={setLikedOverride}
                  className="right-0 top-[calc(100%+8px)]"
                />
              )}
            </div>
          </div>
          </div>

          {/* ── 1. IMAGE GALLERY ── */}
          <div ref={galleryRef} className="mt-6 mb-8">
            <ImageGallery
              images={images}
              propertyName={property.propertyName}
            />
          </div>

          {/* Host line & Quick stats */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 py-6 border-y border-gray-200 mb-8">
            {property.host && (
              <Link href={`/hosts/${property.host.id}`} className="flex items-center gap-4 rounded-2xl transition-colors hover:bg-gray-50">
                <UserAvatar src={property.host.avatar} name={property.host.name} size={56} className="shadow-sm" />
                <div>
                  <p className="text-[16px] font-bold text-gray-900">
                    Hosted by {property.host.name}
                  </p>
                  <p className="text-[13px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                    {property.host.isSuperhost && (
                      <span className="font-bold text-rose-600 flex items-center gap-1">
                        <Award className="w-3.5 h-3.5" /> Superhost
                      </span>
                    )}
                    {property.host.isSuperhost && <span>·</span>}
                    <span>{property.host.tripsHosted} trips hosted</span>
                  </p>
                </div>
              </Link>
            )}

            <div className="flex items-center gap-6 md:ml-auto">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                <span className="text-type-poppins-medium-18-128-03 text-gray-900">
                  {property.rating > 0 ? property.rating.toFixed(1) : "New"}
                </span>
                <span className="text-type-poppins-regular-15-128-03 text-gray-500 underline underline-offset-2">
                  {property.reviewCount} reviews
                </span>
              </div>
              <div className="w-px h-10 bg-gray-200 hidden md:block" />
              <div className="flex flex-col text-type-poppins-regular-15-128-03 text-gray-600 gap-1">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-gray-400" />{" "}
                  {property.maxGuests} {property.maxGuests === 1 ? "Guest" : "Guests"}
                </span>
                {property.bedrooms != null && property.bedrooms > 0 && (
                  <span className="flex items-center gap-1.5">
                    <BedDouble className="w-4 h-4 text-gray-400" />{" "}
                    {property.bedrooms} {property.bedrooms === 1 ? "Bedroom" : "Bedrooms"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h2 className="text-type-poppins-semibold-24-140-03 text-gray-900 mb-4">
              About this space
            </h2>
            <p className="text-type-poppins-regular-16-128-03 text-gray-600 leading-relaxed max-w-4xl">
              {descIsLong && !descExpanded
                ? `${(property.description ?? "").slice(0, 400)}…`
                : (property.description ??
                  `Experience the charm of ${property.city} in this beautifully curated ${property.propertyType.toLowerCase()}.`)}
            </p>
            {descIsLong && (
              <button
                onClick={() => setDescExpanded((v) => !v)}
                className="flex items-center gap-1 text-type-poppins-medium-18-128-03 text-gray-900 underline underline-offset-4 mt-4 hover:text-figma-navy transition-colors"
              >
                {descExpanded ? "Show less" : "Read more"}
                <ChevronDown
                  className={cn(
                    "w-4 h-4 transition-transform",
                    descExpanded && "rotate-180",
                  )}
                />
              </button>
            )}
          </div>
        </div>

        {/* ── 2. FACILITIES ── */}
        <div id="facilities" className="pt-8 border-t border-gray-200">
          <h2 className="text-type-poppins-semibold-24-140-03 text-gray-900 mb-6">
            Facilities
          </h2>
          {visibleAmenities.length === 0 && (
            <p className="text-type-poppins-regular-16-128-03 text-gray-500">
              The host hasn&apos;t listed any facilities yet.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-8 max-w-4xl">
            {visibleAmenities.map((am, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3",
                  !am.available && "opacity-50",
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                    am.available
                      ? "bg-[#f8f7f6] text-gray-700"
                      : "bg-gray-100 text-gray-400",
                  )}
                >
                  {AMENITY_ICON_MAP[am.icon] ?? (
                    <CheckCircle className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-type-poppins-regular-16-128-03",
                    am.available
                      ? "text-gray-800"
                      : "text-gray-400 line-through",
                  )}
                >
                  {am.name}
                </span>
              </div>
            ))}
          </div>
          {amenities.length > 8 && (
            <button
              onClick={() => setShowAllAmenities((v) => !v)}
              className="mt-6 px-5 py-2.5 border border-gray-900 rounded-full text-type-poppins-medium-12-140-03 text-gray-900 hover:bg-gray-50 transition-colors"
            >
              {showAllAmenities
                ? "Show less"
                : `Show all ${amenities.length} amenities`}
            </button>
          )}
        </div>

        {/* ── 3. AVAILABILITY ── */}
        <div id="availability" className="pt-8 border-t border-gray-200">
          <h2 className="text-type-poppins-semibold-24-140-03 text-gray-900 mb-6">
            Availability
          </h2>
          {BOOKING_DISABLED && (
            <div
              role="status"
              className="mb-5 max-w-4xl rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900"
            >
              <strong className="font-semibold">Bookings are paused for a short while.</strong> You can still check
              dates, save this stay to your wishlist, or message the host -- we&apos;ll be taking bookings again soon.
            </div>
          )}
          <div className="w-full max-w-4xl">
            <BookingWidget
              property={property}
              onNightsChange={setBarNights}
              onGuestsChange={setBarGuests}
              selectedAddonIds={selectedAddonIds}
            />
          </div>
        </div>

        {/* ── 4. MAP LOCATION ── */}
        <div id="location" className="pt-8 border-t border-gray-200">
          <h2 className="text-type-poppins-semibold-24-140-03 text-gray-900 mb-2">
            Location
          </h2>
          <p className="text-type-poppins-regular-16-128-03 text-gray-700 mb-4">
            {property.address || `${property.city}, ${property.state}`}
          </p>

          {/* Nearby landmarks */}
          {property.nearbyLandmarks && property.nearbyLandmarks.length > 0 && (
            <div className="mb-6">
              <p className="text-type-poppins-medium-12-140-03 text-gray-900 mb-2">
                Nearby Locations -
              </p>
              <ul className="space-y-1.5 text-type-poppins-regular-15-128-03 text-gray-600">
                {property.nearbyLandmarks.map((lm, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    {lm.name} – {lm.distance}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white rounded-[28px] overflow-hidden border border-gray-200 shadow-sm">
            <PropertyMap property={property} />
          </div>
        </div>

        {/* ── 5. RATINGS & REVIEWS ── */}
        <div id="reviews" className="pt-8 border-t border-gray-200">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-type-poppins-semibold-24-140-03 text-gray-900 flex items-center gap-2">
                Ratings &amp; reviews
              </h2>
              {reviews.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
                  <span className="text-type-poppins-medium-28-128-03 text-gray-900 leading-none">
                    {property.rating.toFixed(1)}
                  </span>
                  <span className="text-type-poppins-regular-16-128-03 text-gray-500">
                    ({property.reviewCount} reviews)
                  </span>
                </div>
              )}
            </div>

            {reviews.length > 3 && (
              <button
                onClick={() => setReviewsModalOpen(true)}
                className="hidden sm:flex items-center gap-1.5 text-type-poppins-medium-18-128-03 text-figma-navy hover:underline underline-offset-4"
              >
                View all reviews <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {reviews.length === 0 ? (
            <div className="py-10 text-center bg-gray-50 rounded-3xl border border-gray-200">
              <Star className="w-10 h-10 text-gray-300 fill-gray-200 mx-auto mb-4" />
              <p className="text-type-poppins-medium-18-128-03 text-gray-800">
                No reviews yet
              </p>
              <p className="text-type-poppins-regular-16-128-03 text-gray-500 mt-1">
                Be the first to stay and share your experience.
              </p>
            </div>
          ) : (
            <div
              className="flex gap-5 overflow-x-auto pb-6 -mx-4 px-4 sm:mx-0 sm:px-0"
              style={{ scrollbarWidth: "none" }}
            >
              {previewReviews.map((review) => (
                <div
                  key={review.id}
                  className="bg-white rounded-3xl p-6 border border-gray-200 flex-shrink-0 w-[300px] sm:w-[340px] flex flex-col gap-4 shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <UserAvatar src={review.userAvatar} name={review.userName} size={48} />
                    <div className="min-w-0">
                      <p className="text-type-poppins-medium-18-128-03 text-gray-900 truncate">
                        {review.userName}
                      </p>
                      <p className="text-type-poppins-regular-15-128-03 text-gray-500">
                        {review.reviewDate}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "w-4 h-4",
                          i < review.rating
                            ? "text-amber-400 fill-amber-400"
                            : "text-gray-200 fill-gray-200",
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-type-poppins-regular-16-128-03 text-gray-600 leading-relaxed line-clamp-4 flex-1">
                    {review.reviewText}
                  </p>
                  <button
                    onClick={() => setReviewsModalOpen(true)}
                    className="text-type-poppins-medium-12-140-03 text-gray-900 underline underline-offset-4 hover:text-figma-navy transition-colors text-left mt-2"
                  >
                    Read more
                  </button>
                </div>
              ))}
            </div>
          )}

          {reviews.length > 3 && (
            <button
              onClick={() => setReviewsModalOpen(true)}
              className="mt-4 sm:hidden w-full flex items-center justify-center gap-1.5 border border-gray-900 text-gray-900 px-6 py-3.5 rounded-xl text-type-poppins-medium-18-128-03 transition-all hover:bg-gray-50"
            >
              View all {reviews.length} reviews
            </button>
          )}

          <div className="mt-8 max-w-2xl">
            <WriteReview listingId={property.id} onSubmitted={handleReviewSubmitted} />
          </div>
        </div>

        {/* ── 6. ADD-ONS ── */}
        {property.addons && property.addons.length > 0 && (
          <div id="addons" className="pt-8 border-t border-gray-200">
            <h2 className="text-type-poppins-semibold-24-140-03 text-gray-900 mb-6">
              Suggested Add-ons
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              {property.addons.map((addon) => {
                const checked = selectedAddonIds.includes(addon.addonId);
                return (
                  <div
                    key={addon.addonId}
                    className={cn(
                      "flex flex-col p-5 rounded-3xl border-2 transition-all",
                      checked
                        ? "border-figma-navy bg-figma-navy/5 shadow-md shadow-figma-navy/10"
                        : "border-dashed border-gray-300 bg-white hover:border-figma-navy/30",
                    )}
                  >
                    <div className="flex-1 min-w-0 mb-4">
                      <p className="text-type-poppins-medium-18-128-03 text-gray-900 leading-tight mb-2">
                        {addon.name}
                      </p>
                      {addon.includes && (
                        <p className="text-type-poppins-regular-15-128-03 text-gray-500 line-clamp-2">
                          {addon.includes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-type-poppins-medium-18-128-03 text-figma-navy">
                        +{formatINR(addon.price)}
                      </span>
                      <button
                        onClick={() => toggleAddon(addon.addonId)}
                        className={cn(
                          "px-4 py-2 rounded-full text-type-poppins-medium-12-140-03 transition-all",
                          checked
                            ? "bg-figma-navy text-white"
                            : "bg-gray-100 text-gray-800 hover:bg-gray-200",
                        )}
                      >
                        {checked ? "Added" : "Add +"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 7. HOST INFORMATION ── */}
        <div className="pt-8 border-t border-gray-200">
          <h2 className="text-type-poppins-semibold-24-140-03 text-gray-900 mb-6">
            Contact host
          </h2>
          {property.host && (
            <div className="flex flex-col md:flex-row gap-8 items-start">
              {/* Left: Compact Host Card */}
              <div className="bg-white rounded-[24px] p-6 border border-gray-200 shadow-sm w-full md:w-[280px] flex flex-col items-center text-center flex-shrink-0">
                <UserAvatar
                  src={property.host.avatar}
                  name={property.host.name}
                  size={80}
                  className="rounded-full shadow-sm mb-3"
                />
                <h3 className="text-type-poppins-medium-18-128-03 text-gray-900">
                  {property.host.name}
                </h3>
                {property.host.isSuperhost && (
                  <span className="text-type-poppins-medium-12-140-03 text-rose-600 flex items-center justify-center gap-1 mt-0.5">
                    <Award className="w-3.5 h-3.5" /> Superhost
                  </span>
                )}
                <p className="text-type-poppins-medium-12-140-03 text-gray-400 mt-0.5">Joined 1 year ago</p>

                <div className="flex items-center gap-1 mt-2 text-type-poppins-medium-12-140-03 text-gray-800">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>{property.host.rating}</span>
                  <span className="text-gray-400 font-normal">· {property.host.tripsHosted} reviews</span>
                </div>

                <div className="w-full border-t border-gray-100 my-4 pt-3 space-y-1.5 text-type-poppins-medium-12-140-03 text-gray-600 text-left">
                  <p>
                    <span className="font-semibold text-gray-800">Response Rate:</span>{" "}
                    {property.host.responseRate ? `${property.host.responseRate}%` : "98%"}
                  </p>
                  <p>
                    <span className="font-semibold text-gray-800">Avg response time:</span>{" "}
                    within 1 hour
                  </p>
                </div>

                <button
                  onClick={() => {
                    if (!isAuthenticated || !userId) {
                      toast.error("Please sign in to message the host");
                      router.push(
                        `/signin?redirect=${encodeURIComponent(window.location.href)}`,
                      );
                      return;
                    }
                    router.push(
                      `/chat?hostId=${encodeURIComponent(property.host!.id)}`,
                    );
                  }}
                  className="w-full py-2 border border-gray-900 text-gray-900 rounded-full text-type-poppins-medium-12-140-03 hover:bg-gray-50 transition-colors"
                >
                  Contact Me
                </button>
                <Link
                  href={`/hosts/${property.host.id}`}
                  className="mt-2 w-full py-2 text-center text-type-poppins-medium-12-140-03 text-figma-navy hover:underline"
                >
                  View profile
                </Link>
              </div>

              {/* Right: Host Bio + Occupation/Hobbies */}
              <div className="space-y-4 max-w-2xl text-type-poppins-regular-16-128-03 leading-relaxed text-gray-700 flex-1">
                <p>
                  {property.host.bio ||
                    `Hey there! As the host of our property, I'm here to make your stay amazing! Whether it's providing helpful tips, suggesting local spots, or making sure you have everything you need, I've got you covered.`}
                </p>

                <div className="space-y-2 pt-2 text-type-poppins-regular-16-128-03">
                  {property.host.occupation && (
                    <p className="flex items-center gap-2">
                      <span>💼</span>
                      <span className="font-bold text-gray-900">Occupation</span>
                      <span className="text-gray-500">– {property.host.occupation}</span>
                    </p>
                  )}
                  {property.host.hobbies && (
                    <p className="flex items-center gap-2">
                      <span>🎮</span>
                      <span className="font-bold text-gray-900">Hobbies</span>
                      <span className="text-gray-500">– {property.host.hobbies}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 8. HOUSE RULES & CANCELLATION ── */}
        <div id="rules" className="pt-8 border-t border-gray-200 pb-12">
          <h2 className="text-type-poppins-semibold-24-140-03 text-gray-900 mb-8">
            House rules and cancellation details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start max-w-4xl">
            {/* House Rules */}
            <div>
              <h3 className="text-type-poppins-medium-18-128-03 text-gray-900 mb-4">
                House Rules
              </h3>
              {property.houseRules && property.houseRules.length > 0 ? (
                <ul className="space-y-3.5 text-type-poppins-regular-16-128-03 text-gray-700">
                  {property.houseRules.map((rule, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3"
                    >
                      <Clock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="space-y-3.5 text-type-poppins-regular-16-128-03 text-gray-700">
                  <li className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span>Check in time – 1 pm</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span>Check out time – 11 am</span>
                  </li>
                </ul>
              )}
            </div>

            {/* Cancellation Rules */}
            <div>
              <h3 className="text-type-poppins-medium-18-128-03 text-gray-900 mb-4">
                Cancellation Rules
              </h3>

              {property.cancellationPolicy === "strict" ? (
                <div className="space-y-3">
                  <ul className="space-y-3 text-type-poppins-regular-16-128-03">
                    <li className="flex items-center gap-2.5 text-amber-700 font-medium">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      {Math.round(
                        (property.strictPartialRefundPercent ??
                          CANCELLATION_POLICY_DEFAULTS.strictPartialRefundPercent) * 100,
                      )}% refundable before {CANCELLATION_POLICY_DEFAULTS.strictPartialRefundDays} days
                    </li>
                    <li className="flex items-center gap-2.5 text-rose-700 font-medium">
                      <X className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      Non-refundable after {CANCELLATION_POLICY_DEFAULTS.strictPartialRefundDays} days before check-in
                    </li>
                  </ul>
                  <div className="border border-rose-300 bg-rose-50/50 rounded-xl p-4 mt-4">
                    <h4 className="text-type-poppins-medium-12-140-03 text-rose-900 mb-1">
                      Failure to Arrive Policy
                    </h4>
                    <p className="text-type-poppins-medium-12-140-03 text-rose-800 leading-relaxed">
                      In case of a no-show without prior notice, the full booking amount will be charged and the reservation will be canceled.
                    </p>
                  </div>
                </div>
              ) : property.cancellationPolicy === "flexible" ? (
                <div className="space-y-3">
                  <ul className="space-y-3 text-type-poppins-regular-16-128-03">
                    <li className="flex items-center gap-2.5 text-emerald-700 font-medium">
                      <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      Free Cancellation before {CANCELLATION_POLICY_DEFAULTS.flexibleFullRefundHours} hours of check-in
                    </li>
                    <li className="flex items-center gap-2.5 text-rose-700 font-medium">
                      <X className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      Non-refundable after that
                    </li>
                  </ul>
                  <div className="border border-rose-300 bg-rose-50/50 rounded-xl p-4 mt-4">
                    <h4 className="text-type-poppins-medium-12-140-03 text-rose-900 mb-1">
                      Failure to Arrive Policy
                    </h4>
                    <p className="text-type-poppins-medium-12-140-03 text-rose-800 leading-relaxed">
                      In case of a no-show without prior notice, the full booking amount will be charged and the reservation will be canceled.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <ul className="space-y-3 text-type-poppins-regular-16-128-03">
                    <li className="flex items-center gap-2.5 text-emerald-700 font-medium">
                      <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      Free Cancellation {CANCELLATION_POLICY_DEFAULTS.moderateFullRefundDays}+ days before check-in
                    </li>
                    <li className="flex items-center gap-2.5 text-amber-700 font-medium">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      50% refundable before 24 hours
                    </li>
                    <li className="flex items-center gap-2.5 text-rose-700 font-medium">
                      <X className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      Non-refundable after check-in
                    </li>
                  </ul>
                  <div className="border border-rose-300 bg-rose-50/50 rounded-xl p-4 mt-4">
                    <h4 className="text-type-poppins-medium-12-140-03 text-rose-900 mb-1">
                      Failure to Arrive Policy
                    </h4>
                    <p className="text-type-poppins-medium-12-140-03 text-rose-800 leading-relaxed">
                      In case of a no-show without prior notice, the full booking amount will be charged and the reservation will be canceled.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Report an issue footer */}
          <div className="mt-12 text-center pt-8 border-t border-gray-100">
            <button className="text-type-poppins-regular-16-128-03 font-bold text-gray-900 underline underline-offset-4 hover:text-figma-navy transition-colors">
              Report an issue
            </button>
            <p className="text-type-poppins-medium-12-140-03 text-gray-500 mt-1">
              Let us know if you faced any issue during your stay or with the host.
            </p>
          </div>
        </div>

        {/* ── 9. SUGGESTED STAYS ── */}
        <div className="pt-8 border-t border-gray-200">
          <SuggestedStays current={property} />
        </div>
      </div>

      <Footer />

      {/* Reviews full modal */}
      {reviewsModalOpen && (
        <ReviewsModal
          reviews={reviews}
          rating={property.rating}
          reviewCount={property.reviewCount}
          onClose={() => setReviewsModalOpen(false)}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes modalSlideUp { from { opacity: 0; transform: translateY(24px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        html { scroll-behavior: smooth; }
      `}</style>
    </div>
  );
}
