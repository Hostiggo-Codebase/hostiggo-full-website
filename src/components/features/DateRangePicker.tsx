import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { blockedStayDates } from "@/lib/stayDates";

interface DateRangePickerProps {
  checkIn: Date | null;
  checkOut: Date | null;
  onChange: (checkIn: Date | null, checkOut: Date | null) => void;
  onClose: () => void;
  blockedDates?: Set<string>;
}

// Monday-first week (weekend columns are highlighted).
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
// Offset of the 1st with a Monday-first week (Mon=0 … Sun=6).
function firstDayOf(y: number, m: number) { return (new Date(y, m, 1).getDay() + 6) % 7; }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface CalendarMonthProps {
  year: number;
  month: number;
  checkIn: Date | null;
  checkOut: Date | null;
  hoverDate: Date | null;
  selecting: "checkin" | "checkout";
  blockedDates: Set<string>;
  onDayClick: (d: Date) => void;
  onDayHover: (d: Date | null) => void;
  onDayMouseDown: (d: Date) => void;
}

function CalendarMonth({
  year,
  month,
  checkIn,
  checkOut,
  hoverDate,
  selecting,
  blockedDates,
  onDayClick,
  onDayHover,
  onDayMouseDown,
}: CalendarMonthProps) {
  const today = new Date(); today.setHours(0,0,0,0);
  const totalDays = daysInMonth(year, month);
  const startOffset = firstDayOf(year, month);

  const rangeEnd = checkOut ?? (selecting === "checkout" && hoverDate ? hoverDate : null);

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(<div key={`empty-${i}`} className="h-[var(--dp-cell,28px)] w-full" />);

  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month, day);
    date.setHours(0,0,0,0);
    const isPast = date < today;
    const isBooked = blockedDates.has(isoDate(date));
    const validCheckout = selecting === "checkout" && checkIn && date > checkIn &&
      blockedStayDates(checkIn, date, blockedDates).length === 0;
    const isDisabled = isPast || (isBooked && !validCheckout);
    const isStart = checkIn ? sameDay(date, checkIn) : false;
    const isEnd   = checkOut ? sameDay(date, checkOut) : false;
    const isHoverEnd = !checkOut && selecting === "checkout" && hoverDate ? sameDay(date, hoverDate) : false;
    const isEndOrHover = isEnd || isHoverEnd;
    const inRange = checkIn && rangeEnd ? (date > checkIn && date < rangeEnd) : false;
    const isToday = sameDay(date, today);

    // Determines if the start/end date needs a background bar connecting it to adjacent in-range cells
    const hasRangeConnectionRight = isStart && rangeEnd && rangeEnd > date && !isEndOrHover;
    const hasRangeConnectionLeft  = isEndOrHover && checkIn && date > checkIn && !isStart;

    cells.push(
      <button
        key={day}
        type="button"
        disabled={isDisabled}
        title={isBooked && !isPast ? (validCheckout ? "Checkout only" : "Unavailable") : undefined}
        aria-label={`${isoDate(date)}${isBooked ? (validCheckout ? ", checkout only" : ", unavailable") : ""}`}
        onClick={() => !isDisabled && onDayClick(date)}
        onMouseDown={() => !isDisabled && onDayMouseDown(date)}
        onMouseEnter={() => !isDisabled && onDayHover(date)}
        onMouseLeave={() => onDayHover(null)}
        className={cn(
          "relative w-full h-[var(--dp-cell,28px)] p-0 flex items-center justify-center text-sm select-none transition-colors",
          inRange && "bg-[#8DA8B9]",
          hasRangeConnectionRight && "before:absolute before:right-0 before:top-0 before:bottom-0 before:w-1/2 before:bg-[#8DA8B9]",
          hasRangeConnectionLeft && "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1/2 before:bg-[#8DA8B9]",
          isDisabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span
          className={cn(
            "relative z-10 w-[var(--dp-cell,28px)] h-[var(--dp-cell,28px)] flex items-center justify-center text-sm font-medium transition-all",
            (isStart || isEndOrHover) && "rounded-full bg-figma-navy text-white font-bold shadow-md",
            inRange && "text-gray-900 font-medium",
            !isStart && !isEndOrHover && !inRange && !isDisabled && "rounded-full text-gray-800 hover:bg-gray-100 font-medium",
            isDisabled && "text-gray-300",
            isBooked && !isPast && "line-through text-gray-300",
            isToday && !isStart && !isEndOrHover && !inRange && "rounded-full ring-1 ring-figma-navy font-bold text-figma-navy"
          )}
        >
          {day}
        </span>
      </button>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      <p className="text-base sm:text-lg font-bold text-gray-900 text-center leading-8 sm:leading-9 mb-1 sm:mb-2">
        {MONTH_NAMES[month]} {year}
      </p>
      <div className="grid grid-cols-7 mb-1 sm:mb-2 border border-gray-200 rounded-md py-0.5 sm:py-1">
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={cn(
              "text-center text-xs font-semibold py-0.5 sm:py-1",
              i >= 5 ? "text-blue-500" : "text-gray-400"
            )}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">{cells}</div>
    </div>
  );
}

const EMPTY_BLOCKED = new Set<string>();

const FLEX_OPTIONS = [
  { id: "exact", label: "Exact dates" },
  { id: "1", label: "± 1 Days" },
  { id: "2", label: "± 2 Days" },
  { id: "3", label: "± 3 Days" },
  { id: "7", label: "± 7 Days" },
];

export default function DateRangePicker({
  checkIn,
  checkOut,
  onChange,
  onClose,
  blockedDates = EMPTY_BLOCKED,
}: DateRangePickerProps) {
  const today = new Date();
  const [baseYear, setBaseYear] = useState(today.getFullYear());
  const [baseMonth, setBaseMonth] = useState(today.getMonth());
  const [selecting, setSelecting] = useState<"checkin" | "checkout">(checkIn ? "checkout" : "checkin");
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [rangeError, setRangeError] = useState("");
  // Date flexibility (visual for now, "Exact dates" is the default).
  const [flex, setFlex] = useState("exact");

  // On short screens the panel opens partly below the fold -- bring it into
  // view so both months and the actions are on screen.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  // Fit the popup to the screen: day cells start at 28px on phones / 36px
  // otherwise and shrink (down to 22px) until the whole panel is shorter
  // than the viewport, so it never needs scrolling to reach "Done".
  const fitToViewport = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let cell = window.innerWidth >= 640 ? 36 : 28;
    panel.style.setProperty("--dp-cell", `${cell}px`);
    // Room actually visible: the sticky site header covers the top of the page.
    const headerH =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-header-h")) || 0;
    const maxHeight = window.innerHeight - headerH - 24;
    while (panel.offsetHeight > maxHeight && cell > 22) {
      cell -= 1;
      panel.style.setProperty("--dp-cell", `${cell}px`);
    }
  }, []);

  useLayoutEffect(() => {
    fitToViewport();
    window.addEventListener("resize", fitToViewport);
    return () => window.removeEventListener("resize", fitToViewport);
  }, [fitToViewport, baseYear, baseMonth, rangeError]);

  // Click-and-drag range selection
  const dragStartRef = useRef<Date | null>(null);
  const justDraggedRef = useRef(false);

  const handleDayMouseDown = (date: Date) => {
    justDraggedRef.current = false;
    if (selecting === "checkin") dragStartRef.current = date;
  };

  useEffect(() => {
    const handleMouseUp = () => {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      if (!start || !hoverDate || sameDay(start, hoverDate) || hoverDate <= start) return;
      justDraggedRef.current = true;
      if (blockedStayDates(start, hoverDate, blockedDates).length) {
        setRangeError("This stay includes blocked dates. Please choose another range.");
        return;
      }
      setRangeError("");
      onChange(start, hoverDate);
      setSelecting("checkin");
      onClose();
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverDate, blockedDates, onChange, onClose]);

  const nextYear  = baseMonth === 11 ? baseYear + 1 : baseYear;
  const nextMonth = baseMonth === 11 ? 0 : baseMonth + 1;

  // Don't allow navigating before the current month (all past dates are disabled).
  const atCurrentMonth = baseYear === today.getFullYear() && baseMonth === today.getMonth();

  const prev = () => {
    if (baseMonth === 0) { setBaseYear(y => y - 1); setBaseMonth(11); }
    else setBaseMonth(m => m - 1);
  };
  const next = () => {
    if (baseMonth === 11) { setBaseYear(y => y + 1); setBaseMonth(0); }
    else setBaseMonth(m => m + 1);
  };

  const handleDayClick = (date: Date) => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    setRangeError("");
    if (selecting === "checkin") {
      onChange(date, null);
      setSelecting("checkout");
    } else {
      if (checkIn && date <= checkIn) {
        onChange(date, null);
        setSelecting("checkout");
      } else {
        if (checkIn && blockedStayDates(checkIn, date, blockedDates).length) {
          setRangeError("This stay includes blocked dates. Please choose another range.");
          return;
        }
        onChange(checkIn, date);
        setSelecting("checkin");
        onClose();
      }
    }
  };

  return (
    // Sized to its content -- no inner scrollbar. Check-in / check-out are
    // shown by the search bar's own pills, so the panel doesn't repeat them.
    // Months sit side by side on wider screens and stack on phones.
    <div
      ref={panelRef}
      className="dropdown-panel !relative shrink-0 animate-fade-in-down p-4 sm:p-6"
      style={{
        width: "min(720px, 95vw)",
        // Keep it clear of the sticky header / screen bottom when scrolled into view.
        scrollMarginTop: "calc(var(--site-header-h, 0px) + 12px)",
        scrollMarginBottom: "12px",
      }}
    >
      {/* Two-month calendars with edge navigation */}
      <div className="relative">
        {!atCurrentMonth && (
          <button
            type="button"
            onClick={prev}
            aria-label="Previous month"
            className="absolute left-0 top-0 w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors z-20"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
        )}
        <button
          type="button"
          onClick={next}
          aria-label="Next month"
          className="absolute right-0 top-0 w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors z-20"
        >
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-8">
          <CalendarMonth
            year={baseYear}
            month={baseMonth}
            checkIn={checkIn}
            checkOut={checkOut}
            hoverDate={hoverDate}
            selecting={selecting}
            blockedDates={blockedDates}
            onDayClick={handleDayClick}
            onDayHover={setHoverDate}
            onDayMouseDown={handleDayMouseDown}
          />
          {/* Second month only from tablet width up; phones page through
              months with the arrows so the popup stays short. */}
          <div className="hidden sm:block flex-1 min-w-0">
            <CalendarMonth
              year={nextYear}
              month={nextMonth}
              checkIn={checkIn}
              checkOut={checkOut}
              hoverDate={hoverDate}
              selecting={selecting}
              blockedDates={blockedDates}
              onDayClick={handleDayClick}
              onDayHover={setHoverDate}
              onDayMouseDown={handleDayMouseDown}
            />
          </div>
        </div>
      </div>

      {/* Date flexibility pills */}
      <p className="mt-2 text-xs text-gray-500">Unavailable dates are crossed out.</p>
      {rangeError && <p role="alert" className="mt-2 text-sm text-red-600">{rangeError}</p>}
      <div className="flex flex-wrap gap-2 sm:gap-3 mt-3 pt-3 border-t border-gray-100">
        {FLEX_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setFlex(o.id)}
            className={cn(
              "px-3.5 py-1.5 sm:px-5 sm:py-2 rounded-full border text-sm font-medium transition-colors",
              flex === o.id
                ? "border-figma-navy/40 text-figma-navy bg-figma-navy/5"
                : "border-gray-200 text-gray-700 hover:border-gray-300"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={() => { onChange(null, null); setSelecting("checkin"); }}
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors font-medium underline underline-offset-2"
        >
          Clear dates
        </button>
        <button
          type="button"
          onClick={onClose}
          className="bg-figma-navy hover:bg-figma-navy/90 active:bg-figma-navy text-white px-6 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm"
        >
          Done
        </button>
      </div>
    </div>
  );
}
