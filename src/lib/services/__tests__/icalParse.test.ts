import { describe, expect, it } from "vitest";
import { parseBlockedDates } from "../icalParse";

const wrap = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}END:VCALENDAR\r\n`;
const ev = (lines: string[]) => `BEGIN:VEVENT\r\n${lines.join("\r\n")}\r\nEND:VEVENT\r\n`;

describe("parseBlockedDates", () => {
  it("treats all-day DTEND as exclusive (checkout day stays free)", () => {
    const ics = wrap(ev(["DTSTART;VALUE=DATE:20270110", "DTEND;VALUE=DATE:20270113"]));
    expect(parseBlockedDates(ics, "2027-01-01")).toEqual(["2027-01-10", "2027-01-11", "2027-01-12"]);
  });

  it("blocks one night when DTEND is missing", () => {
    expect(parseBlockedDates(wrap(ev(["DTSTART;VALUE=DATE:20270110"])), "2027-01-01")).toEqual(["2027-01-10"]);
  });

  it("skips cancelled events and merges overlaps without duplicates", () => {
    const ics = wrap(
      ev(["DTSTART;VALUE=DATE:20270110", "DTEND;VALUE=DATE:20270112"]) +
        ev(["DTSTART;VALUE=DATE:20270111", "DTEND;VALUE=DATE:20270113"]) +
        ev(["DTSTART;VALUE=DATE:20270120", "DTEND;VALUE=DATE:20270122", "STATUS:CANCELLED"]),
    );
    expect(parseBlockedDates(ics, "2027-01-01")).toEqual(["2027-01-10", "2027-01-11", "2027-01-12"]);
  });

  it("drops past dates and unfolds wrapped lines", () => {
    const ics = wrap(ev(["DTSTART;VALUE=DATE:20270105", "DTEND;VALUE=DATE:20270108", "SUMMARY:Long", " wrapped"]));
    expect(parseBlockedDates(ics, "2027-01-07")).toEqual(["2027-01-07"]);
  });

  it("an empty feed is valid and clears blocks; non-iCal text throws", () => {
    expect(parseBlockedDates(wrap(""), "2027-01-01")).toEqual([]);
    expect(() => parseBlockedDates("<html>nope</html>", "2027-01-01")).toThrow();
  });
});

describe('parseBlockedDates repeating events', () => {
  const from = '2027-01-01';
  const rec = (rule: string, extra: string[] = [], start = 'DTSTART;VALUE=DATE:20270104') =>
    wrap(ev([start, 'DTEND;VALUE=DATE:' + start.slice(-8).replace(/^(\d{8}).*/, '$1').replace(/(\d{8})/, (d) => String(Number(d) + 1)), 'UID:abc', 'RRULE:' + rule, ...extra]));

  it('expands DAILY with COUNT', () => {
    const out = parseBlockedDates(rec('FREQ=DAILY;COUNT=3'), from);
    expect(out).toEqual(['2027-01-04', '2027-01-05', '2027-01-06']);
  });

  it('expands WEEKLY BYDAY until UNTIL', () => {
    // 2027-01-04 is a Monday.
    const out = parseBlockedDates(rec('FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20270113T000000Z'), from);
    expect(out).toEqual(['2027-01-04', '2027-01-06', '2027-01-11', '2027-01-13']);
  });

  it('honours INTERVAL', () => {
    const out = parseBlockedDates(rec('FREQ=WEEKLY;INTERVAL=2;COUNT=3'), from);
    expect(out).toEqual(['2027-01-04', '2027-01-18', '2027-02-01']);
  });

  it('expands MONTHLY on the start day and on an nth weekday', () => {
    expect(parseBlockedDates(rec('FREQ=MONTHLY;COUNT=3'), from)).toEqual(['2027-01-04', '2027-02-04', '2027-03-04']);
    // 2nd Monday of Jan/Feb/Mar 2027 -> 11th, 8th, 8th
    expect(parseBlockedDates(rec('FREQ=MONTHLY;BYDAY=2MO;COUNT=3'), from)).toEqual(['2027-01-11', '2027-02-08', '2027-03-08']);
  });

  it('expands YEARLY', () => {
    const out = parseBlockedDates(rec('FREQ=YEARLY;COUNT=2'), from);
    expect(out).toEqual(['2027-01-04', '2028-01-04']);
  });

  it('skips EXDATE exceptions and instances replaced via RECURRENCE-ID', () => {
    const master = rec('FREQ=DAILY;COUNT=4', ['EXDATE;VALUE=DATE:20270105']);
    const moved = ev(['DTSTART;VALUE=DATE:20270120', 'DTEND;VALUE=DATE:20270121', 'UID:abc', 'RECURRENCE-ID;VALUE=DATE:20270106']);
    const out = parseBlockedDates(master.replace('END:VCALENDAR', moved + 'END:VCALENDAR'), from);
    // 4,(5 excluded),(6 moved to 20),7 + the moved instance on the 20th
    expect(out).toEqual(['2027-01-04', '2027-01-07', '2027-01-20']);
  });

  it('never runs past the 18-month window and ignores unsupported rules', () => {
    const out = parseBlockedDates(rec('FREQ=DAILY'), from);
    expect(out.length).toBe(545); // 2027-01-04 .. 2028-07-01, the window ends 548 days after 2027-01-01
    expect(out[out.length - 1]).toBe('2028-07-01');
    expect(parseBlockedDates(rec('FREQ=SECONDLY'), from)).toEqual(['2027-01-04']);
  });
});
