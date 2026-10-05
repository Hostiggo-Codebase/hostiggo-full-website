// Place names people search for that don't match how `locations` rows are
// stored. Keys are lowercase. An alias either widens the search to a whole
// state or swaps in the district name the listings are actually filed under.
type DestinationAlias = { state?: string; district?: string };

const DESTINATION_ALIASES: Record<string, DestinationAlias> = {
  // Delhi is a city-state. The destination dropdown's "New Delhi" city guide
  // (and every one of its popular areas) searches "New Delhi", but most Delhi
  // listings are filed under district "Delhi", so search the whole state.
  'new delhi': { state: 'Delhi' },
  // Old name for the city; its listings are filed under "Gurugram".
  gurgaon: { district: 'Gurugram' },
};

// The name a place should be stored and looked up under. Old/alternate city
// names that have a canonical district ("Gurgaon" -> "Gurugram") are mapped to
// it, so a listing created for "Gurgaon" is filed with the other Gurugram
// stays instead of under a name search no longer matches. Names without a
// district alias (including "New Delhi", which only widens a search) are
// returned trimmed, otherwise unchanged.
export function canonicalPlaceName(name: string): string {
  const trimmed = name.trim();
  return resolveDestinationAlias(trimmed)?.district ?? trimmed;
}

export function resolveDestinationAlias(destination?: string | null): DestinationAlias | null {
  if (!destination) return null;
  return DESTINATION_ALIASES[destination.trim().toLowerCase()] ?? null;
}
