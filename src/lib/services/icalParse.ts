// Pure iCal parsing (no I/O) so it can be unit-tested. Used by icalSync.ts.

export const MAX_DAYS_AHEAD = 548; // ~18 months

const DAY_MS = 86_400_000;
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

type Prop = { params: string; value: string };

function parseProp(line: string): (Prop & { name: string }) | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const [name, ...params] = line.slice(0, colon).split(";");
  return { name: name.toUpperCase(), params: params.join(";").toUpperCase(), value: line.slice(colon + 1).trim() };
}

/** "20260115" / "20260115T140000Z" -> date part as written + whether time is midnight. */
function parseIcsDate(p: Prop): { iso: string; midnight: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(p.value);
  if (!m) return null;
  const midnight = !m[4] || (m[4] === "00" && m[5] === "00" && m[6] === "00");
  return { iso: `${m[1]}-${m[2]}-${m[3]}`, midnight };
}

const MAX_OCCURRENCES = 20_000; // hard stop against pathological RRULEs

const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const dowOf = (ms: number) => new Date(ms).getUTCDay();
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

type Rule = {
  freq: string;
  interval: number;
  count: number | null;
  untilMs: number | null;
  byDay: { ord: number; dow: number }[];
  byMonthDay: number[];
};

function parseRule(raw: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const piece of raw.split(";")) {
    const eq = piece.indexOf("=");
    if (eq > 0) parts[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1);
  }
  const freq = (parts.FREQ ?? "").toUpperCase();
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  const until = /^(\d{4})(\d{2})(\d{2})/.exec(parts.UNTIL ?? "");
  return {
    freq,
    interval: Math.max(1, Number.parseInt(parts.INTERVAL ?? "1", 10) || 1),
    count: parts.COUNT ? Math.max(0, Number.parseInt(parts.COUNT, 10) || 0) : null,
    untilMs: until ? dayMs(`${until[1]}-${until[2]}-${until[3]}`) : null,
    byDay: (parts.BYDAY ?? "")
      .split(",")
      .map((d) => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(d.trim()))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ ord: m[1] ? Number(m[1]) : 0, dow: BYDAY[m[2].toUpperCase()] })),
    byMonthDay: (parts.BYMONTHDAY ?? "")
      .split(",")
      .map((d) => Number.parseInt(d, 10))
      .filter((n) => Number.isFinite(n) && n !== 0),
  };
}

/** nth (1-based) or last (-1) given weekday of a month, as a day-of-month; null if it doesn't exist. */
function nthWeekdayOfMonth(y: number, m: number, dow: number, ord: number): number | null {
  const dim = daysInMonth(y, m);
  if (ord > 0) {
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const day = 1 + ((dow - first + 7) % 7) + (ord - 1) * 7;
    return day <= dim ? day : null;
  }
  const last = new Date(Date.UTC(y, m, dim)).getUTCDay();
  const day = dim - ((last - dow + 7) % 7) + (ord + 1) * 7;
  return day >= 1 ? day : null;
}

/** Start days (ms, UTC midnight) of every occurrence, in order, until the rule or the limit ends. */
function occurrenceStarts(startMs: number, rule: Rule, limitMs: number): number[] {
  const out: number[] = [];
  const hardStop = Math.min(limitMs, rule.untilMs ?? Infinity);
  // Returns false once the series is over (past the window/UNTIL, COUNT reached, or the safety cap).
  const push = (ms: number): boolean => {
    if (ms < startMs) return true; // before DTSTART: not an instance
    if (ms > hardStop) return false;
    out.push(ms);
    return !(rule.count !== null && out.length >= rule.count) && out.length < MAX_OCCURRENCES;
  };
  if (rule.count === 0) return out;
  const start = new Date(startMs);
  const sy = start.getUTCFullYear();
  const sm = start.getUTCMonth();
  const sd = start.getUTCDate();

  if (rule.freq === "DAILY") {
    for (let k = 0; ; k++) if (!push(startMs + k * rule.interval * DAY_MS)) break;
  } else if (rule.freq === "WEEKLY") {
    const days = (rule.byDay.length ? rule.byDay.map((b) => b.dow) : [dowOf(startMs)])
      .map((d) => (d + 6) % 7) // Monday-based week position (WKST=MO)
      .sort((a, b) => a - b);
    const weekStart = startMs - ((dowOf(startMs) + 6) % 7) * DAY_MS;
    outer: for (let w = 0; ; w++) {
      const base = weekStart + w * rule.interval * 7 * DAY_MS;
      if (base > hardStop) break;
      for (const pos of days) if (!push(base + pos * DAY_MS)) break outer;
    }
  } else if (rule.freq === "MONTHLY") {
    outer: for (let k = 0; ; k++) {
      const monthIndex = sm + k * rule.interval;
      const y = sy + Math.floor(monthIndex / 12);
      const m = ((monthIndex % 12) + 12) % 12;
      if (Date.UTC(y, m, 1) > hardStop) break;
      const candidates: number[] = [];
      if (rule.byDay.length) {
        for (const b of rule.byDay) {
          if (b.ord) {
            const d = nthWeekdayOfMonth(y, m, b.dow, b.ord);
            if (d) candidates.push(d);
          } else {
            for (let d = 1; d <= daysInMonth(y, m); d++) {
              if (new Date(Date.UTC(y, m, d)).getUTCDay() === b.dow) candidates.push(d);
            }
          }
        }
      } else if (rule.byMonthDay.length) {
        for (const d of rule.byMonthDay) candidates.push(d > 0 ? d : daysInMonth(y, m) + d + 1);
      } else {
        candidates.push(sd);
      }
      for (const d of [...new Set(candidates)].sort((a, b) => a - b)) {
        if (d < 1 || d > daysInMonth(y, m)) continue; // e.g. the 31st in a 30-day month is skipped
        if (!push(Date.UTC(y, m, d))) break outer;
      }
    }
  } else {
    // YEARLY: same month/day each interval (Feb 29 only on leap years).
    for (let k = 0; ; k++) {
      const y = sy + k * rule.interval;
      if (Date.UTC(y, sm, 1) > hardStop) break;
      if (sd > daysInMonth(y, sm)) continue;
      if (!push(Date.UTC(y, sm, sd))) break;
    }
  }
  return out;
}

type IcsDate = { iso: string; midnight: boolean };
type RawEvent = {
  start: IcsDate;
  end: IcsDate | null;
  rrule: string | null;
  exdates: Set<string>;
  uid: string | null;
  recurrenceId: string | null;
};

/**
 * ICS text -> sorted unique blocked nights (YYYY-MM-DD), clipped to
 * [from, from + MAX_DAYS_AHEAD]. An all-day DTEND is exclusive (checkout day).
 * Cancelled events are ignored. Repeating events (RRULE, with EXDATE exceptions
 * and edited single instances via RECURRENCE-ID) are expanded over the same
 * window. Throws if the text isn't an iCal feed.
 */
export function parseBlockedDates(ics: string, from: string): string[] {
  if (!/BEGIN:VCALENDAR/i.test(ics)) throw new Error("Not an iCal feed");
  const lines = ics.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const fromMs = dayMs(from);
  const limitMs = fromMs + MAX_DAYS_AHEAD * DAY_MS;
  const blocked = new Set<string>();
  const events: RawEvent[] = [];
  // "uid|YYYY-MM-DD" of occurrences replaced by an edited/moved single instance.
  const overridden = new Set<string>();

  let inEvent = false;
  let start: IcsDate | null = null;
  let end: IcsDate | null = null;
  let cancelled = false;
  let rrule: string | null = null;
  let exdates = new Set<string>();
  let uid: string | null = null;
  let recurrenceId: string | null = null;

  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      inEvent = true; start = null; end = null; cancelled = false;
      rrule = null; exdates = new Set(); uid = null; recurrenceId = null;
      continue;
    }
    if (upper === "END:VEVENT") {
      if (inEvent && start) {
        if (recurrenceId && uid) overridden.add(`${uid}|${recurrenceId}`);
        if (!cancelled) events.push({ start, end, rrule, exdates, uid, recurrenceId });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;
    const prop = parseProp(line);
    if (!prop) continue;
    if (prop.name === "DTSTART") start = parseIcsDate(prop);
    else if (prop.name === "DTEND") end = parseIcsDate(prop);
    else if (prop.name === "STATUS" && prop.value.toUpperCase() === "CANCELLED") cancelled = true;
    else if (prop.name === "RRULE") rrule = prop.value;
    else if (prop.name === "UID") uid = prop.value;
    else if (prop.name === "RECURRENCE-ID") recurrenceId = parseIcsDate(prop)?.iso ?? null;
    else if (prop.name === "EXDATE") {
      for (const v of prop.value.split(",")) {
        const d = parseIcsDate({ params: prop.params, value: v.trim() });
        if (d) exdates.add(d.iso);
      }
    }
  }

  const block = (s: number, e: number) => {
    for (let d = Math.max(s, fromMs); d < Math.min(e, limitMs); d += DAY_MS) blocked.add(toIso(d));
  };

  for (const event of events) {
    const s = dayMs(event.start.iso);
    // No DTEND -> one night. A timed end after midnight still occupies that day.
    let e = event.end ? dayMs(event.end.iso) + (event.end.midnight ? 0 : DAY_MS) : s + DAY_MS;
    if (e <= s) e = s + DAY_MS;
    const rule = event.rrule && !event.recurrenceId ? parseRule(event.rrule) : null;
    if (!rule) {
      block(s, e);
      continue;
    }
    const length = e - s;
    for (const occ of occurrenceStarts(s, rule, limitMs)) {
      const iso = toIso(occ);
      if (event.exdates.has(iso)) continue;
      if (event.uid && overridden.has(`${event.uid}|${iso}`)) continue;
      block(occ, occ + length);
    }
  }
  return [...blocked].sort();
}
