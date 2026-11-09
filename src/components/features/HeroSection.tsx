"use client";

import SearchForm from "@/components/features/SearchForm";
import { Check } from "lucide-react";
import Image from "next/image";

import {
  useListingActions,
  useListingState,
} from "@/context/ListingFilterContext";
import { cn } from "@/lib/utils";
import type { SearchFilters } from "@/types";

const heroBg = "/hero-bg.jpg?v=4";

const HERO_TAGS = [
  { id: "budget", label: "₹1000 - ₹ 3000" },
  { id: "breakfast", label: "Breakfast" },
  { id: "cancellation", label: "Free cancellation" },
  { id: "entire", label: "Entire place" },
  { id: "5star", label: "5 ★" },
  { id: "above3", label: "Above 3 ★" },
  { id: "lowest", label: "Lowest price" },
] as const;

export default function HeroSection() {
  const { filters, sort } = useListingState();
  const { setPriceRange, setRating, setBooleanFilter, setSort, toggleStayType } =
    useListingActions();

  const isChecked = (id: string): boolean => {
    switch (id) {
      case "budget":
        return filters.priceMin === 1000 && filters.priceMax === 3000;
      case "breakfast":
        return filters.breakfast;
      case "cancellation":
        return filters.freeCancellation;
      case "entire":
        return filters.stayTypes.includes("Entire Property");
      case "5star":
        return filters.guestRating === 5;
      case "above3":
        return filters.guestRating === 3;
      case "lowest":
        return sort === "price_asc";
      default:
        return false;
    }
  };

  const toggleTag = (id: string) => {
    const active = isChecked(id);
    switch (id) {
      case "budget":
        setPriceRange(active ? [0, 100000] : [1000, 3000]);
        break;
      case "breakfast":
        setBooleanFilter("breakfast" as keyof SearchFilters, !active);
        break;
      case "cancellation":
        setBooleanFilter("freeCancellation" as keyof SearchFilters, !active);
        break;
      case "entire":
        toggleStayType("Entire Property");
        break;
      case "5star":
        setRating(active ? null : 5);
        break;
      case "above3":
        setRating(active ? null : 3);
        break;
      case "lowest":
        setSort(active ? "recommended" : "price_asc");
        break;
    }
  };

  return (
    <section className="pb-8 lg:pb-12 pt-4 flex items-center">
      <div className="container-main w-full min-w-0">
        {/* Outer White Card Container — spacious and modern */}
        <div className="bg-white rounded-[28px] sm:rounded-[36px] shadow-[0_10px_36px_rgba(0,0,0,0.06)] flex flex-col lg:flex-row items-stretch max-w-[1240px] mx-auto">
          {/* Left: hero image card */}
          <div
            className="relative w-full lg:w-[480px] xl:w-[510px] flex-shrink-0 select-none flex flex-col rounded-[24px] sm:rounded-[30px] lg:rounded-l-[36px] lg:rounded-r-[30px] overflow-hidden z-10"
            style={{ minHeight: 485 }}
          >
            <Image
              src={heroBg}
              alt="Aerial view of a beach"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 470px"
              className="object-cover"
              quality={95}
            />
            {/* Subtle dark gradient overlay for black-toned image feel */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/25 to-black/50" />

            <div
              className="relative z-10 p-6 sm:p-7 flex flex-col h-full justify-between"
              style={{ minHeight: 485 }}
            >
              {/* Text styling matching Figma Dev Mode */}
              <div>
                <p
                  className="text-white mb-0"
                  style={{
                    fontSize: "30px",
                    fontWeight: 400,
                    lineHeight: "135%",
                    letterSpacing: "0.003em",
                  }}
                >
                  Discover your next
                </p>
                <h1
                  className="text-white"
                  style={{
                    fontSize: "52px",
                    fontWeight: 600,
                    lineHeight: "135%",
                    letterSpacing: "0.003em",
                  }}
                >
                  Perfect homestay
                </h1>
              </div>

              {/* Popular Choices Glass Panel */}
              <div className="pt-3">
                <div
                  className="backdrop-blur-[2px] rounded-[20px] p-3 sm:p-4"
                  style={{
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.06)",
                  }}
                >
                  <h3
                    className="text-center text-white mb-2.5"
                    style={{
                      fontSize: "19px",
                      fontWeight: 500,
                      lineHeight: "140%",
                      letterSpacing: "0.15em",
                    }}
                  >
                    Popular Choices
                  </h3>

                  {/* Rectangular option boxes with square checkboxes */}
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {HERO_TAGS.map(({ id, label }) => {
                      const checked = isChecked(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleTag(id)}
                          aria-pressed={checked}
                          className="flex items-center gap-1.5 text-[13.5px] font-normal text-[#1B1B1B] px-3 py-1.5 rounded-lg bg-white hover:bg-white transition-all cursor-pointer shadow-sm border border-gray-100/80"
                        >
                          <span
                            className={cn(
                              "w-3.5 h-3.5 rounded-[3px] flex items-center justify-center transition-colors flex-shrink-0",
                              checked
                                ? "bg-figma-navy text-white border border-figma-navy"
                                : "bg-white border border-gray-300",
                            )}
                          >
                            {checked && (
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            )}
                          </span>
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: search panel — spacious padding */}
          <div className="flex-1 flex flex-col justify-center p-6 sm:p-8 lg:p-10 w-full rounded-b-[28px] sm:rounded-b-[36px] lg:rounded-bl-none lg:rounded-r-[36px]">
            <SearchForm />
          </div>
        </div>
      </div>
    </section>
  );
}
