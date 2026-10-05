import { describe, it, expect } from "vitest";
import { mergeScopePages, sanitizeSearchTerm, scopesFromLocations } from "../destinationScopes";

describe("sanitizeSearchTerm", () => {
  it("strips characters that would change a PostgREST filter", () => {
    expect(sanitizeSearchTerm("Shim,la)")).toBe("Shim la");
    expect(sanitizeSearchTerm("100%_ok*")).toBe("100 ok");
  });

  it("trims and collapses whitespace", () => {
    expect(sanitizeSearchTerm("  Shimla   Hills ")).toBe("Shimla Hills");
    expect(sanitizeSearchTerm(undefined)).toBe("");
  });
});

describe("scopesFromLocations", () => {
  it("makes one scope per distinct state and district, ignoring case", () => {
    expect(
      scopesFromLocations([
        { state: "Uttarakhand", district: "dehradun" },
        { state: "Uttarakhand", district: "Dehradun" },
        { state: "Himachal Pradesh", district: "Shimla" },
      ]),
    ).toEqual([
      { state: "Uttarakhand", district: "dehradun" },
      { state: "Himachal Pradesh", district: "Shimla" },
    ]);
  });

  it("skips rows with no place at all and tolerates null rows", () => {
    expect(scopesFromLocations([null, undefined, { state: null, district: " " }])).toEqual([]);
  });

  it("caps the number of scopes", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ state: "S", district: `D${i}` }));
    expect(scopesFromLocations(rows)).toHaveLength(10);
  });
});

const row = (id: number) => ({ listing: { listing_id: id } });

describe("mergeScopePages", () => {
  it("merges pages in ascending listing order and drops repeats", () => {
    const { rows, more } = mergeScopePages([[row(5), row(9)], [row(2), row(9)]], 10);
    expect(rows.map((r) => r.listing.listing_id)).toEqual([2, 5, 9]);
    expect(more).toBe(false);
  });

  it("trims to the page size and reports more when the page is full", () => {
    const { rows, more } = mergeScopePages([[row(1), row(3)], [row(2), row(4)]], 3);
    expect(rows.map((r) => r.listing.listing_id)).toEqual([1, 2, 3]);
    expect(more).toBe(true);
  });

  it("matches a single scope's behaviour: a page of exactly pageSize may have more", () => {
    expect(mergeScopePages([[row(1), row(2)]], 2).more).toBe(true);
    expect(mergeScopePages([[row(1)]], 2).more).toBe(false);
  });
});
