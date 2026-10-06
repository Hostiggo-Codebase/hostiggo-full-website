import { useEffect, useRef, useState } from "react";
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

function fmtDate(d: Date | null) {
  if (!d) return "N/A";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

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
  for (let i = 0; i < startOffset; i++) cells.push(<div key={`empty-${i}`} className="h-9 w-full" />);

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
          "relative w-full h-9 p-0 flex items-center justify-center text-sm select-none transition-colors",
          inRange && "bg-[#8DA8B9]",
          hasRangeConnectionRight && "before:absolute before:right-0 before:top-0 before:bottom-0 before:w-1/2 before:bg-[#8DA8B9]",
          hasRangeConnectionLeft && "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1/2 before:bg-[#8DA8B9]",
          isDisabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span
          className={cn(
            "relative z-10 w-9 h-9 flex items-center justify-center text-sm font-medium transition-all",
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
      <p className="text-lg font-bold text-gray-900 text-center mb-4">
        {MONTH_NAMES[month]} {year}
      </p>
      <div className="grid grid-cols-7 mb-4 border border-gray-200 rounded-md py-2">
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={cn(
              "text-center text-xs font-semibold py-1",
              i >= 5 ? "text-blue-500" : "text-gray-400"
            )}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">{cells}</div>
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
    <div
      className="dropdown-panel !relative shrink-0 animate-fade-in-down p-6 max-h-[min(80vh,650px)] overflow-y-auto"
      style={{ width: "min(720px, 95vw)" }}
    >
      {/* Date selection header */}
      <div className="flex gap-3 mb-5">
        {[
          { label: "Check in", date: checkIn, panel: "checkin" as const },
          { label: "Check out", date: checkOut, panel: "checkout" as const },
        ].map(({ label, date, panel }) => (
          <button
            key={panel}
            type="button"
            onClick={() => setSelecting(panel)}
            className={cn(
              "flex-1 border rounded-xl p-3 text-left transition-all",
              selecting === panel
                ? "border-figma-navy bg-figma-navy/5 shadow-sm"
                : "border-gray-200 hover:border-gray-300"
            )}
          >
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
            <p className={cn("text-sm font-semibold", date ? "text-gray-900" : "text-gray-400")}>
              {fmtDate(date)}
            </p>
          </button>
        ))}
      </div>

      {/* Two-month calendars with edge navigation */}
      <div className="relative overflow-x-auto scrollbar-hide">
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

        <div className="flex gap-8 min-w-[560px]">
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

      {/* Date flexibility pills */}
      <p className="mt-3 text-xs text-gray-500">Unavailable dates are crossed out.</p>
      {rangeError && <p role="alert" className="mt-2 text-sm text-red-600">{rangeError}</p>}
      <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-gray-100">
        {FLEX_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setFlex(o.id)}
            className={cn(
              "px-5 py-2.5 rounded-full border text-sm font-medium transition-colors",
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
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
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
