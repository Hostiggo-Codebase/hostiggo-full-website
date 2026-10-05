import { describe, it, expect } from "vitest";
import { canonicalPlaceName, resolveDestinationAlias } from "../destinationAliases";

describe("resolveDestinationAlias", () => {
  it("widens New Delhi to the whole Delhi state", () => {
    expect(resolveDestinationAlias("New Delhi")).toEqual({ state: "Delhi" });
  });

  it("maps Gurgaon to the Gurugram district", () => {
    expect(resolveDestinationAlias("Gurgaon")).toEqual({ district: "Gurugram" });
  });

  it("ignores case and surrounding whitespace", () => {
    expect(resolveDestinationAlias("  new DELHI ")).toEqual({ state: "Delhi" });
    expect(resolveDestinationAlias("GURGAON")).toEqual({ district: "Gurugram" });
  });

  it("returns null for names without an alias", () => {
    expect(resolveDestinationAlias("Delhi")).toBeNull();
    expect(resolveDestinationAlias("Gurugram")).toBeNull();
    expect(resolveDestinationAlias("")).toBeNull();
    expect(resolveDestinationAlias(undefined)).toBeNull();
  });
});

describe("canonicalPlaceName", () => {
  it("files old city names under their current district", () => {
    expect(canonicalPlaceName("Gurgaon")).toBe("Gurugram");
    expect(canonicalPlaceName("  gurgaon ")).toBe("Gurugram");
  });

  it("leaves everything else alone, only trimmed", () => {
    expect(canonicalPlaceName("Gurugram")).toBe("Gurugram");
    expect(canonicalPlaceName(" Shimla ")).toBe("Shimla");
  });

  it("keeps New Delhi as typed: that alias only widens a search to the state", () => {
    expect(canonicalPlaceName("New Delhi")).toBe("New Delhi");
  });
});
