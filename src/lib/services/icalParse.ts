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

/**
 * ICS text -> sorted unique blocked nights (YYYY-MM-DD), clipped to
 * [from, from + MAX_DAYS_AHEAD]. An all-day DTEND is exclusive (checkout day).
 * Cancelled events are ignored. Throws if the text isn't an iCal feed.
 */
export function parseBlockedDates(ics: string, from: string): string[] {
  if (!/BEGIN:VCALENDAR/i.test(ics)) throw new Error("Not an iCal feed");
  const lines = ics.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const fromMs = dayMs(from);
  const limitMs = fromMs + MAX_DAYS_AHEAD * DAY_MS;
  const blocked = new Set<string>();

  let inEvent = false;
  let start: ReturnType<typeof parseIcsDate> = null;
  let end: ReturnType<typeof parseIcsDate> = null;
  let cancelled = false;

  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      inEvent = true; start = null; end = null; cancelled = false;
      continue;
    }
    if (upper === "END:VEVENT") {
      if (inEvent && !cancelled && start) {
        const s = dayMs(start.iso);
        // No DTEND -> one night. A timed end after midnight still occupies that day.
        let e = end ? dayMs(end.iso) + (end.midnight ? 0 : DAY_MS) : s + DAY_MS;
        if (e <= s) e = s + DAY_MS;
        for (let d = Math.max(s, fromMs); d < Math.min(e, limitMs); d += DAY_MS) blocked.add(toIso(d));
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
  }
  return [...blocked].sort();
}
