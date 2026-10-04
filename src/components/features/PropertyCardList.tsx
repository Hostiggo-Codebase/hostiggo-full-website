import { formatINR } from '@/lib/format';
import { useAuth } from "@/context/AuthContext";
import { useListingState } from "@/context/ListingFilterContext";
import { useWishlist } from "@/hooks/useWishlist";
import { allInNightlyPrice } from "@/lib/billing/invoice";
import { cn, toISODate } from "@/lib/utils";
import type { Property } from "@/types";
import { Car, Coffee, Heart, Star, Wifi } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import WishlistPicker from "./WishlistPicker";

interface PropertyCardListProps {
  property: Property;
}

const FALLBACK = "/placeholder.svg";

export default function PropertyCardList({ property }: PropertyCardListProps) {
  const [imgErr, setImgErr] = useState(false);
  const router = useRouter();
  const { dates, guests } = useListingState();

  const nights =
    dates.checkIn && dates.checkOut
      ? Math.max(
          0,
          Math.round(
            (dates.checkOut.getTime() - dates.checkIn.getTime()) / 86400000,
          ),
        )
      : null;
  const totalGuests = guests.adults + guests.children;
  // All-in price for one night, same math as the checkout invoice.
  const allInPerNight = allInNightlyPrice(property.price);
  const feesAndTaxes = Math.max(0, Math.round((allInPerNight - property.price) * 100) / 100);
  const { isAuthenticated, userId } = useAuth();
  const { isSaved } = useWishlist(userId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [likedOverride, setLikedOverride] = useState<boolean | null>(null);
  const liked = likedOverride ?? isSaved(property.id);

  const handleToggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated || !userId) {
      toast("Sign in to save properties to your wishlist.", { id: "wishlist-signin" });
      // Come back to where they were (e.g. the search results), not the listing.
      const here = `${window.location.pathname}${window.location.search}`;
      router.push(`/signin?redirect=${encodeURIComponent(here)}`);
      return;
    }
    setPickerOpen((v) => !v);
  };

  const handleNavigate = () => {
    const checkIn = toISODate(dates.checkIn);
    const checkOut = toISODate(dates.checkOut);
    const params = new URLSearchParams();
    if (checkIn) params.set("checkIn", checkIn);
    if (checkOut) params.set("checkOut", checkOut);
    const qs = params.toString();
    router.push(`/property/${property.id}${qs ? `?${qs}` : ""}`);
  };

  const discount = property.originalPrice
    ? Math.round(
        ((property.originalPrice - property.price) / property.originalPrice) *
          100,
      )
    : null;

  const amenityTags = [
    property.breakfast && {
      label: "Breakfast",
      icon: <Coffee className="w-3 h-3" />,
    },
    property.wifi && { label: "Wifi", icon: <Wifi className="w-3 h-3" /> },
    property.parking && { label: "Parking", icon: <Car className="w-3 h-3" /> },
  ].filter(Boolean) as { label: string; icon: React.ReactNode }[];

  return (
    // Figma node 3122:18947 -- rounded-[45px], border #d9d9d9, shadow
    // 0px 4px 75.4px rgba(0,0,0,0.08), image ~35% of card width (square).
    <div
      className="bg-white rounded-[45px] p-4 flex flex-col sm:flex-row gap-5 sm:gap-8 cursor-pointer group transition-shadow duration-200 border border-[#d9d9d9]"
      style={{ boxShadow: "0px 4px 75.4px 0px rgba(0,0,0,0.08)" }}
      onClick={handleNavigate}
    >
      {/* Image, Figma uses a square (299x299 at an 855-wide card, ~35%) */}
      <div className="relative flex-shrink-0 w-full sm:w-[35%] aspect-square rounded-[35px] overflow-hidden">
        <Image
          src={imgErr ? FALLBACK : property.images[0] || FALLBACK}
          alt={property.propertyName}
          onError={() => setImgErr(true)}
          fill
          sizes="(max-width: 640px) 100vw, 35vw"
          className="object-cover group-hover:scale-105 transition-transform duration-700"
        />
        {/* Heart button */}
        <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={handleToggleLike}
            aria-label={liked ? `Manage wishlists for ${property.propertyName}` : `Save ${property.propertyName} to wishlist`}
            aria-pressed={liked}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-all bg-white/90 backdrop-blur-sm shadow-sm",
              liked
                ? "text-rose-500"
                : "text-gray-500 hover:text-rose-400 hover:scale-110",
            )}
          >
            <Heart className={cn("w-4 h-4", liked && "fill-rose-500")} />
          </button>
          {pickerOpen && userId && (
            <WishlistPicker
              userId={userId}
              listingId={property.id}
              onClose={() => setPickerOpen(false)}
              onSavedChange={setLikedOverride}
              className="right-0 top-[calc(100%+6px)]"
            />
          )}
        </div>
      </div>

      {/* Content Container */}
      <div className="flex-1 flex flex-col justify-between py-1 pr-2 min-w-0">
        {/* Top Section */}
        <div className="min-w-0">
          <h3
            className="text-figma-ink line-clamp-1 mb-2"
            style={{
              fontSize: "25px",
              fontWeight: 600,
              lineHeight: "140%",
              letterSpacing: "0.075px",
            }}
          >
            {property.propertyName}
          </h3>

          <div className="flex items-center gap-2 mb-2">
            {property.rating > 0 ? (
              <div className="flex items-center gap-1.5 bg-figma-navy/5 border border-figma-navy/20 rounded-md px-2 py-0.5">
                <span className="text-[14px] font-semibold text-figma-ink">
                  {property.rating.toFixed(1)}
                </span>
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-figma-surface rounded-md px-2 py-0.5">
                <span className="text-[14px] font-semibold text-figma-muted">
                  New
                </span>
              </div>
            )}
            <span className="text-[14px] text-figma-ink/70">
              · {property.reviewCount} reviews
            </span>
          </div>

          <p className="text-[14px] text-figma-ink/60 font-medium line-clamp-1 mb-3">
            {property.city}, {property.state}
            {property.distanceFromCenter
              ? ` · ${property.distanceFromCenter} from centre`
              : ""}
          </p>

          <div className="flex flex-wrap gap-2 mb-3">
            {property.freeCancellation && (
              <span className="text-[11px] font-bold text-figma-navy bg-figma-navy/5 border border-figma-navy/20 px-2.5 py-1 rounded-md">
                Free cancellation
              </span>
            )}
            {amenityTags.map((tag) => (
              <span
                key={tag.label}
                className="flex items-center gap-1 text-[11px] font-medium text-figma-ink/70 border border-figma-border px-2.5 py-1 rounded-md"
              >
                {tag.icon}
                {tag.label}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom Section (Guests + Price) */}
        <div className="flex justify-between items-end mt-2">
          {/* Room details text */}
          <p className="text-[11px] text-figma-ink/50 font-medium mb-1">
            Up to {property.maxGuests} guest
            {property.maxGuests === 1 ? "" : "s"}
          </p>

          {/* Pricing Column */}
          <div className="flex-shrink-0 flex flex-col items-end text-right">
            {nights !== null && nights > 0 && (
              <p className="text-[12px] text-figma-ink/60 font-medium mb-1">
                {nights} night{nights === 1 ? "" : "s"}, {totalGuests} guest
                {totalGuests === 1 ? "" : "s"}
              </p>
            )}
            {property.originalPrice && (
              <p className="text-[13px] text-figma-ink/40 font-medium line-through mb-0.5">
                {formatINR(allInNightlyPrice(property.originalPrice))}
              </p>
            )}
            <p
              className="text-figma-ink leading-none mb-1"
              style={{
                fontSize: "25px",
                fontWeight: 600,
                lineHeight: "140%",
                letterSpacing: "0.075px",
              }}
            >
              {formatINR(allInPerNight)}
            </p>
            <p className="text-[11px] text-figma-ink/50">
              per night, incl. {formatINR(feesAndTaxes)} taxes &amp; fees
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
