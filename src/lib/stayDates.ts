export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Checkout is not a stay night and may fall on the next guest's blocked date.
export function blockedStayDates(start: Date, end: Date, blocked: ReadonlySet<string>): string[] {
  const dates: string[] = [];
  for (const day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
    const key = localDateKey(day);
    if (blocked.has(key)) dates.push(key);
  }
  return dates;
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export class DatesUnavailableError extends Error {
  constructor(message = "These dates are blocked. Please choose different dates.", public blockedDates: string[] = []) {
    super(message);
    this.name = "DatesUnavailableError";
  }
}

export function isDatabaseAvailabilityError(error: { code?: string; message?: string }): boolean {
  return error.code === "23P01" || (error.code === "P0001" && error.message === "HOSTIGGO_DATES_UNAVAILABLE");
}
