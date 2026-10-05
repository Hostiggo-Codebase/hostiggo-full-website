// What a destination search actually looks up: a state, a district, or both.
// `null` means "don't constrain on this".
export type SearchScope = { state: string | null; district: string | null };

type LocationLike = { state?: string | null; district?: string | null } | null | undefined;

// Fuzzy matching on a one- or two-letter term would match half the country.
export const MIN_FUZZY_TERM_LENGTH = 3;
const MAX_FUZZY_SCOPES = 10;

// Free text from the search box, made safe to drop into a PostgREST
// `.or()` / `ilike` pattern: `,` `(` `)` and the LIKE wildcards `%` `_` `*`
// (and `\`) would otherwise change the meaning of the filter.
export function sanitizeSearchTerm(term?: string | null): string {
  return (term ?? '')
    .replace(/[,()%_*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Collapses the locations of the active listings that fuzzily matched a typed
// term into one scope per distinct (state, district). Case-insensitive, so
// "dehradun" and "Dehradun" are one scope; keeps the first spelling seen.
export function scopesFromLocations(rows: LocationLike[]): SearchScope[] {
  const seen = new Map<string, SearchScope>();
  for (const row of rows) {
    const state = row?.state?.trim() || null;
    const district = row?.district?.trim() || null;
    if (!state && !district) continue;
    const key = `${(state ?? '').toLowerCase()}|${(district ?? '').toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, { state, district });
    if (seen.size >= MAX_FUZZY_SCOPES) break;
  }
  return [...seen.values()];
}

type PageRow = { listing?: { listing_id?: number | null } | null };

// Merges the per-scope result pages (each ascending by listing_id, as the
// search RPC returns them) into one ascending page, dropping repeats.
// `more` is true when there may be another page behind this one.
export function mergeScopePages<T extends PageRow>(
  pages: T[][],
  pageSize: number,
): { rows: T[]; more: boolean } {
  const byId = new Map<number, T>();
  for (const page of pages) {
    for (const row of page) {
      const id = row.listing?.listing_id;
      if (id != null && !byId.has(id)) byId.set(id, row);
    }
  }
  const all = [...byId.values()].sort(
    (a, b) => (a.listing?.listing_id ?? 0) - (b.listing?.listing_id ?? 0),
  );
  return { rows: all.slice(0, pageSize), more: all.length >= pageSize };
}
