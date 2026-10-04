"use client";

import { formatINR } from '@/lib/format';
import { allInNightlyPrice } from "@/lib/billing/invoice";
import { useAuth } from "@/context/AuthContext";
import { useWishlist } from "@/hooks/useWishlist";
import { cn } from "@/lib/utils";
import type { Property } from "@/types";
import { Heart, Star } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import WishlistPicker from "./WishlistPicker";

interface PropertyCardProps {
  property: Property;
}

const FALLBACK = "/placeholder.svg";

export default function PropertyCard({ property }: PropertyCardProps) {
  const [imgErr, setImgErr] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [likedOverride, setLikedOverride] = useState<boolean | null>(null);
  const router = useRouter();
  const { isAuthenticated, userId } = useAuth();
  const { isSaved } = useWishlist(userId);
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

  return (
    <div
      className="bg-white rounded-[28px] overflow-hidden cursor-pointer group transition-shadow duration-200 border border-gray-100"
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}
      onClick={() => router.push(`/property/${property.id}`)}
    >
      {/* Image — taller, elongated card matching Figma */}
      <div
        className="relative overflow-hidden rounded-t-[28px]"
        style={{ height: 230 }}
      >
        <Image
          src={imgErr ? FALLBACK : property.images[0] || FALLBACK}
          alt={property.propertyName}
          onError={() => setImgErr(true)}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleToggleLike}
            aria-label={liked ? "Manage wishlists" : "Add to wishlist"}
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 shadow-md",
              liked
                ? "bg-white text-rose-500"
                : "bg-white/95 text-gray-600 hover:text-rose-400",
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
        {property.isNew && (
          <span className="absolute top-2.5 left-2.5 bg-figma-success text-white text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wide shadow">
            NEW
          </span>
        )}
        <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-black/20 to-transparent" />
      </div>

      {/* Details — clean Poppins typography matching Figma */}
      <div className="px-5 pt-4 pb-4">
        <h3 className="text-[16px] font-medium leading-[1.28] tracking-[0.003em] text-figma-ink line-clamp-1 mb-1">
          {property.propertyName}
        </h3>
        <p className="text-[14px] font-medium leading-[1.4] tracking-[0.003em] text-figma-ink/80 line-clamp-1 mb-2">
          {property.city}, {property.state}
        </p>
        <div className="flex items-center gap-1.5 mb-3">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0" />
          <span className="text-[14px] font-medium leading-[1.4] tracking-[0.003em] text-figma-ink">
            {property.rating > 0 ? property.rating.toFixed(1) : "New"}
          </span>
          <span className="text-[14px] font-medium leading-[1.4] tracking-[0.003em] text-figma-ink/60">
            · {property.reviewCount} reviews
          </span>
        </div>
        {/* Price -- all-in per night (base + GST + Hostiggo fee + GST on
            fee), the same calculation as checkout. This used to show the
            bare weekday rate labelled "/ 2 Nights", which was neither the
            2-night total nor tax-inclusive. */}
        <div className="-ml-5 flex w-fit items-baseline gap-1.5 bg-white border border-figma-navy/30 border-l-0 pl-4 pr-4 py-2 rounded-r-2xl">
          <span className="text-[18px] font-semibold leading-[1.28] tracking-[0.003em] text-figma-ink whitespace-nowrap">
            {formatINR(allInNightlyPrice(property.price))}
          </span>
          <span className="text-[12px] font-normal leading-[1.4] tracking-[0.003em] text-figma-ink/60 whitespace-nowrap">
            / night incl. taxes
          </span>
        </div>
      </div>
    </div>
  );
}
