"use client";

import PropertyCard from "@/components/features/PropertyCard";
import PropertyCardHomeSkeleton from "@/components/features/PropertyCardHomeSkeleton";
import type { Property } from "@/types";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// Card width = (row width - gaps) / cards per view, for 2 / 3 / 4 per view.
const CARD_SLOT =
  "shrink-0 snap-start min-w-0 w-[calc((100%-1.25rem)/2)] sm:w-[calc((100%-2.5rem)/3)] lg:w-[calc((100%-3.75rem)/4)]";

interface PopularStaysProps {
  title: string;
  properties: Property[];
  isLoading?: boolean;
  itemsPerRow?: number;
}

export default function PopularStays({
  title,
  properties,
  isLoading = false,
  itemsPerRow = 4,
}: PopularStaysProps) {
  const city = properties[0]?.city ?? "";
  const viewAllHref = `/search?destination=${encodeURIComponent(city)}`;
  const rowRef = useRef<HTMLDivElement>(null);
  // Only show the arrow when the row actually has cards off to the right.
  const [overflows, setOverflows] = useState(false);

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (row) setOverflows(row.scrollWidth > row.clientWidth + 2);
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [measure, properties.length, isLoading]);

  // The arrow steps the row to the next card in place (wrapping back to the
  // first card at the end). It used to be a link to the full results list.
  const showNext = () => {
    const row = rowRef.current;
    if (!row) return;
    const first = row.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const step = (first?.offsetWidth ?? row.clientWidth) + gap;
    const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollTo({
      left: atEnd ? 0 : row.scrollLeft + step,
      behavior: reduce ? "auto" : "smooth",
    });
  };

  return (
    <section>
      <div className="flex items-center gap-4 mb-5">
        <h2
          className="text-figma-ink"
          style={{ fontSize: "20px", fontWeight: 500, lineHeight: "140%" }}
        >
          {title}
        </h2>
        {/*
          These two "View all" controls used to be <button onClick={() =>
          router.push(...)}>. That onClick only becomes live once React has
          hydrated this component -- until then the button is inert (it's
          plain HTML with no href, so the browser has nothing to fall back
          on). On a homepage this heavy, that hydration window is wide
          enough that a real click landing early enough was a silent no-op:
          reproduced directly by clicking immediately after navigation, with
          the URL never changing. A next/link <Link> renders a real <a
          href> tag, so a click works via native browser navigation even
          before hydration finishes, and gets hijacked into a client-side
          transition once it has -- same end behavior, no dead window.
        */}
        <Link
          href={viewAllHref}
          className="text-typo-pill-label text-figma-ink/70 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1 rounded-full transition-all"
        >
          View all
        </Link>
      </div>
      <div className="relative">
        {/* One scrollable row: 2 / 3 / 4 cards visible at phone / tablet /
            desktop widths, the rest reached with the arrow or a swipe. */}
        <div
          ref={rowRef}
          className="flex gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-hide overscroll-x-contain py-4 -my-4"
        >
          {isLoading
            ? Array.from({ length: itemsPerRow }).map((_, i) => (
                <div key={`skeleton-${i}`} className={CARD_SLOT}>
                  <PropertyCardHomeSkeleton />
                </div>
              ))
            : properties.map((p) => (
                <div key={p.id} className={CARD_SLOT}>
                  <PropertyCard property={p} />
                </div>
              ))}
        </div>
        {!isLoading && overflows && (
          <button
            type="button"
            onClick={showNext}
            aria-label="Show next stay"
            className="absolute -right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-lg hover:shadow-xl flex items-center justify-center text-figma-ink hover:text-figma-navy transition-all group z-10"
          >
            <ArrowRight className="w-[18px] h-[18px] group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
      </div>
    </section>
  );
}
