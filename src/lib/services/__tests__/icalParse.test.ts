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
