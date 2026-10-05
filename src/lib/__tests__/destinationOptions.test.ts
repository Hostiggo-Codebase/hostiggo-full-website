import { describe, it, expect } from "vitest";
import { buildDestinationOptions, countStaysFor, normalizePlaceName } from "../destinationOptions";

// What search_locations_partial returns for "Haryana" (trimmed to the fields used).
const HARYANA_ROWS = [
  { state: "Haryana", district: "Gurgaon", lower_division_name: "Gurgaon" },
  { state: "Haryana", district: "Faridabad", lower_division_name: "12-6/3" },
  { state: "Haryana", district: "Faridabad", lower_division_name: "48" },
  { state: "Haryana", district: "Faridabad", lower_division_name: "A9171" },
  { state: "Haryāna", district: "Faridabad", lower_division_name: "Main Bazaar Road" },
  { state: "Haryana", district: "Gurugram", lower_division_name: "Gurugram" },
];

const names = (opts: { name: string; wholeState: boolean }[]) =>
  opts.map((o) => (o.wholeState ? `ALL ${o.name}` : o.name));

describe("buildDestinationOptions", () => {
  it("offers the whole state first, then one option per city", () => {
    expect(names(buildDestinationOptions(HARYANA_ROWS, "Haryana"))).toEqual([
      "ALL Haryana",
      "Gurugram",
      "Faridabad",
    ]);
  });

  it("matches the state on a partial, case-insensitive query", () => {
    expect(names(buildDestinationOptions(HARYANA_ROWS, "harya"))[0]).toBe("ALL Haryana");
  });

  it("prefers the unaccented state spelling", () => {
    const rows = [{ state: "Haryāna", district: "Faridabad" }, { state: "Haryana", district: "Gurugram" }];
    expect(buildDestinationOptions(rows, "Haryana")[0].name).toBe("Haryana");
  });

  it("shows the old Gurgaon row as Gurugram", () => {
    const rows = [{ state: "Haryana", district: "Gurgaon", lower_division_name: "Gurgaon" }];
    expect(names(buildDestinationOptions(rows, "Gurg"))).toEqual(["Gurugram"]);
  });

  it("adds no whole-state option when the query only matches a city", () => {
    const rows = [{ state: "Madhya Pradesh", district: "Bhopal", lower_division_name: "Bhopal" }];
    expect(names(buildDestinationOptions(rows, "Bhopal"))).toEqual(["Bhopal"]);
  });

  it("folds a place named after its own state into the whole-state option", () => {
    const rows = [
      { state: "Goa", district: "Goa", lower_division_name: "Goa" },
      { state: "Goa", district: "North Goa" },
    ];
    expect(names(buildDestinationOptions(rows, "Goa"))).toEqual(["ALL Goa", "North Goa"]);
  });

  it("ranks places by their state's listing count, keeping DB order for ties", () => {
    const rows = [
      { state: "Uttarakhand", district: "Rishikesh" },
      { state: "Himachal Pradesh", district: "Rishikesh Road" },
      { state: "Uttarakhand", district: "Haridwar" },
    ];
    const counts: Record<string, number> = { "Himachal Pradesh": 9, Uttarakhand: 3 };
    expect(names(buildDestinationOptions(rows, "Ri", (s) => counts[s] ?? 0))).toEqual([
      "Rishikesh Road",
      "Rishikesh",
      "Haridwar",
    ]);
  });
});

describe("normalizePlaceName", () => {
  it("ignores case, accents and surrounding whitespace", () => {
    expect(normalizePlaceName("  Haryāna ")).toBe("haryana");
    expect(normalizePlaceName(undefined)).toBe("");
  });
});

describe("place states", () => {
  it("sends the unaccented state for a picked place, so the search's state match works", () => {
    const rows = [{ state: "Haryāna", district: "Faridabad" }];
    expect(buildDestinationOptions(rows, "Farid")[0].state).toBe("Haryana");
  });
});

describe("countStaysFor", () => {
  const rows = [
    { locations: { state: "Delhi", district: "Delhi" } },
    { locations: { state: "Delhi", district: "Delhi" } },
    { locations: { state: "Haryana", district: "Gurugram" } },
    { locations: { state: "Himachal Pradesh", district: "Shimla" } },
    { locations: { state: "Himachal Pradesh", district: "Manali" } },
    { locations: { state: "Uttarakhand", district: "dehradun" } },
    { locations: null },
  ];

  it("counts a city by its own district, not its whole state", () => {
    expect(countStaysFor("Shimla", rows)).toBe(1);
    expect(countStaysFor("shimla ", rows)).toBe(1);
  });

  it("counts a state name as the whole state", () => {
    expect(countStaysFor("Himachal Pradesh", rows)).toBe(2);
    expect(countStaysFor("Delhi", rows)).toBe(2);
  });

  it("follows the destination aliases", () => {
    expect(countStaysFor("New Delhi", rows)).toBe(2);
    expect(countStaysFor("Gurgaon", rows)).toBe(1);
  });

  it("is case-insensitive on the stored district", () => {
    expect(countStaysFor("Dehradun", rows)).toBe(1);
  });

  it("is zero for unknown or empty names", () => {
    expect(countStaysFor("Atlantis", rows)).toBe(0);
    expect(countStaysFor("", rows)).toBe(0);
  });
});
