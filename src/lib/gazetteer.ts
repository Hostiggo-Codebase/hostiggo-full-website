// Where a searched place IS, for places we have no stays in yet. Used by search
// only to (a) recognise alternate spellings / old names ("orissa", "odhisha",
// "bombay") and (b) find a centre point so stays within driving distance can be
// offered instead of an empty page. It is a plain list of well-known Indian
// states, union territories, cities and tourist towns -- coordinates are
// approximate town centres / state centres, accurate to a few km, which is all a
// 15-200 km search radius needs. It is NOT used for places that already have
// stays: those take their centre from the stays themselves.

export type PlaceKind = "state" | "city";
export interface Place {
  name: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  /** Other spellings and old names, any case. */
  aliases?: string[];
}

const S = (name: string, lat: number, lon: number, aliases?: string[]): Place => ({ name, kind: "state", lat, lon, aliases });
const C = (name: string, lat: number, lon: number, aliases?: string[]): Place => ({ name, kind: "city", lat, lon, aliases });

export const PLACES: Place[] = [
  // States and union territories (geographic centres)
  S("Andhra Pradesh", 15.91, 79.74), S("Arunachal Pradesh", 28.22, 94.73), S("Assam", 26.2, 92.94),
  S("Bihar", 25.1, 85.31), S("Chhattisgarh", 21.28, 81.87), S("Goa", 15.3, 74.12),
  S("Gujarat", 22.26, 71.19), S("Haryana", 29.06, 76.09), S("Himachal Pradesh", 31.1, 77.17, ["himachal"]),
  S("Jharkhand", 23.61, 85.28), S("Karnataka", 15.32, 75.71), S("Kerala", 10.85, 76.27),
  S("Madhya Pradesh", 22.97, 78.66, ["mp"]), S("Maharashtra", 19.75, 75.71), S("Manipur", 24.66, 93.91),
  S("Meghalaya", 25.47, 91.37), S("Mizoram", 23.16, 92.94), S("Nagaland", 26.16, 94.56),
  S("Odisha", 20.95, 85.1, ["orissa", "odhisha", "odisa", "orisa", "odissa"]), S("Punjab", 31.15, 75.34),
  S("Rajasthan", 27.02, 74.22), S("Sikkim", 27.53, 88.51), S("Tamil Nadu", 11.13, 78.66, ["tamilnadu"]),
  S("Telangana", 18.11, 79.02), S("Tripura", 23.94, 91.99), S("Uttar Pradesh", 26.85, 80.91, ["up"]),
  S("Uttarakhand", 30.07, 79.02, ["uttaranchal"]), S("West Bengal", 22.99, 87.85, ["bengal"]),
  S("Delhi", 28.61, 77.21, ["new delhi", "delhi ncr", "ncr"]), S("Jammu and Kashmir", 33.5, 75.0, ["kashmir", "j&k", "jammu kashmir"]),
  S("Ladakh", 34.15, 77.58), S("Chandigarh", 30.73, 76.78), S("Puducherry", 11.94, 79.81, ["pondicherry", "pondy"]),
  S("Andaman and Nicobar Islands", 11.74, 92.66, ["andaman", "andamans"]), S("Lakshadweep", 10.57, 72.64),

  // Uttar Pradesh
  C("Lucknow", 26.8467, 80.9462, ["lakhnau"]), C("Kanpur", 26.4499, 80.3319), C("Prayagraj", 25.4358, 81.8463, ["allahabad"]),
  C("Varanasi", 25.3176, 82.9739, ["banaras", "benares", "kashi"]), C("Agra", 27.1767, 78.0081), C("Ayodhya", 26.7922, 82.1998, ["faizabad"]),
  C("Noida", 28.5355, 77.391), C("Greater Noida", 28.4744, 77.504), C("Ghaziabad", 28.6692, 77.4538), C("Gorakhpur", 26.7606, 83.3732),
  C("Mathura", 27.4924, 77.6737), C("Vrindavan", 27.5806, 77.6974), C("Meerut", 28.9845, 77.7064), C("Bareilly", 28.367, 79.4304),
  C("Jhansi", 25.4484, 78.5685), C("Aligarh", 27.8974, 78.088),
  // Delhi NCR
  C("Gurugram", 28.4595, 77.0266, ["gurgaon"]), C("Faridabad", 28.4089, 77.3178),
  // Maharashtra
  C("Mumbai", 19.076, 72.8777, ["bombay"]), C("Pune", 18.5204, 73.8567, ["poona"]), C("Nagpur", 21.1458, 79.0882),
  C("Nashik", 19.9975, 73.7898), C("Chhatrapati Sambhajinagar", 19.8762, 75.3433, ["aurangabad"]), C("Navi Mumbai", 19.033, 73.0297),
  C("Thane", 19.2183, 72.9781), C("Lonavala", 18.7546, 73.4062), C("Mahabaleshwar", 17.9237, 73.6586), C("Alibag", 18.6414, 72.8722),
  // Karnataka
  C("Bengaluru", 12.9716, 77.5946, ["bangalore", "banglore", "bengalooru", "blr"]), C("Mysuru", 12.2958, 76.6394, ["mysore"]),
  C("Mangaluru", 12.9141, 74.856, ["mangalore"]), C("Hubballi", 15.3647, 75.124, ["hubli"]), C("Coorg", 12.4244, 75.7382, ["kodagu", "madikeri"]),
  C("Hampi", 15.335, 76.46), C("Gokarna", 14.5479, 74.3188), C("Chikmagalur", 13.3161, 75.772, ["chikkamagaluru"]),
  // Tamil Nadu / Puducherry
  C("Chennai", 13.0827, 80.2707, ["madras"]), C("Coimbatore", 11.0168, 76.9558, ["kovai"]), C("Madurai", 9.9252, 78.1198),
  C("Ooty", 11.4102, 76.695, ["udhagamandalam", "udagamandalam"]), C("Kodaikanal", 10.2381, 77.4892), C("Tiruchirappalli", 10.7905, 78.7047, ["trichy"]),
  C("Rameswaram", 9.2876, 79.3129), C("Kanyakumari", 8.0883, 77.5385),
  // Telangana / Andhra
  C("Hyderabad", 17.385, 78.4867), C("Visakhapatnam", 17.6868, 83.2185, ["vizag", "vishakhapatnam"]), C("Vijayawada", 16.5062, 80.648),
  C("Tirupati", 13.6288, 79.4192),
  // Kerala
  C("Kochi", 9.9312, 76.2673, ["cochin", "ernakulam"]), C("Thiruvananthapuram", 8.5241, 76.9366, ["trivandrum"]), C("Munnar", 10.0889, 77.0595),
  C("Alappuzha", 9.4981, 76.3388, ["alleppey"]), C("Kozhikode", 11.2588, 75.7804, ["calicut"]), C("Wayanad", 11.6854, 76.132), C("Thekkady", 9.6, 77.16),
  // East
  C("Kolkata", 22.5726, 88.3639, ["calcutta"]), C("Darjeeling", 27.041, 88.2663, ["darjeling"]), C("Siliguri", 26.7271, 88.3953),
  C("Bhubaneswar", 20.2961, 85.8245, ["bhubaneshwar"]), C("Puri", 19.8135, 85.8312), C("Cuttack", 20.4625, 85.883), C("Konark", 19.8876, 86.0945),
  C("Rourkela", 22.2604, 84.8536), C("Patna", 25.5941, 85.1376), C("Gaya", 24.7914, 85.0002), C("Bodh Gaya", 24.6961, 84.9869),
  C("Ranchi", 23.3441, 85.3096), C("Jamshedpur", 22.8046, 86.2029),
  // Central
  C("Raipur", 21.2514, 81.6296), C("Bhopal", 23.2599, 77.4126), C("Indore", 22.7196, 75.8577), C("Jabalpur", 23.1815, 79.9864),
  C("Gwalior", 26.2183, 78.1828), C("Ujjain", 23.1765, 75.7885), C("Khajuraho", 24.8318, 79.9199), C("Pachmarhi", 22.4674, 78.4346),
  // Rajasthan / Gujarat
  C("Jaipur", 26.9124, 75.7873), C("Jodhpur", 26.2389, 73.0243), C("Udaipur", 24.5854, 73.7125), C("Jaisalmer", 26.9157, 70.9083),
  C("Pushkar", 26.4897, 74.5511), C("Ajmer", 26.4499, 74.6399), C("Bikaner", 28.0229, 73.3119), C("Mount Abu", 24.5926, 72.7156),
  C("Kota", 25.2138, 75.8648), C("Ranthambore", 26.0173, 76.5026, ["sawai madhopur"]),
  C("Ahmedabad", 23.0225, 72.5714), C("Surat", 21.1702, 72.8311), C("Vadodara", 22.3072, 73.1812, ["baroda"]), C("Rajkot", 22.3039, 70.8022),
  C("Dwarka", 22.2394, 68.9678), C("Bhuj", 23.242, 69.6669, ["kutch", "kachchh"]), C("Gandhinagar", 23.2156, 72.6369),
  // Punjab / Himachal / Uttarakhand
  C("Amritsar", 31.634, 74.8723), C("Ludhiana", 30.901, 75.8573), C("Jalandhar", 31.326, 75.5762), C("Patiala", 30.3398, 76.3869),
  C("Shimla", 31.1048, 77.1734, ["simla"]), C("Manali", 32.2396, 77.1887), C("Dharamshala", 32.219, 76.3234, ["dharamsala"]),
  C("McLeod Ganj", 32.2426, 76.3213, ["mcleodganj"]), C("Kasol", 32.01, 77.314), C("Kullu", 31.9592, 77.1089, ["kulu"]), C("Dalhousie", 32.5373, 75.971),
  C("Spiti", 32.2276, 78.0719, ["kaza"]),
  C("Dehradun", 30.3165, 78.0322), C("Rishikesh", 30.0869, 78.2676), C("Haridwar", 29.9457, 78.1642), C("Mussoorie", 30.4598, 78.0644),
  C("Nainital", 29.3919, 79.4542), C("Jim Corbett", 29.3944, 79.1256, ["corbett", "ramnagar"]), C("Almora", 29.5971, 79.6591), C("Auli", 30.526, 79.565),
  // Jammu & Kashmir / Ladakh
  C("Srinagar", 34.0837, 74.7973), C("Jammu", 32.7266, 74.857), C("Leh", 34.1526, 77.5771), C("Gulmarg", 34.0484, 74.3805),
  C("Pahalgam", 34.0161, 75.315), C("Katra", 32.9916, 74.9455, ["vaishno devi"]),
  // North-east
  C("Guwahati", 26.1445, 91.7362), C("Shillong", 25.5788, 91.8933), C("Kaziranga", 26.5775, 93.1711), C("Imphal", 24.817, 93.9368),
  C("Aizawl", 23.7271, 92.7176), C("Itanagar", 27.0844, 93.6053), C("Agartala", 23.8315, 91.2868), C("Kohima", 25.6751, 94.1086), C("Gangtok", 27.3389, 88.6065),
  // Goa
  C("Panaji", 15.4909, 73.8278, ["panjim"]), C("Candolim", 15.518, 73.7626), C("Calangute", 15.544, 73.755), C("Mapusa", 15.5909, 73.8089),
  C("Margao", 15.2832, 73.9862, ["madgaon"]), C("Palolem", 15.01, 74.0232), C("Colva", 15.2793, 73.922),
  // Islands
  C("Port Blair", 11.6234, 92.7265),
];

/** Lower-case letters and digits only, so "Mount-Abu", "mount abu" and "MountAbu" agree. */
export function normalizePlace(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

/** Classic edit distance, bailing out early once it must exceed `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** How many typos to forgive: none for very short words, 1 up to 7 letters, 2 beyond. */
export function typoBudget(normalized: string): number {
  if (normalized.length <= 4) return 0;
  return normalized.length <= 7 ? 1 : 2;
}

const INDEX: Array<{ key: string; place: Place }> = PLACES.flatMap((place) =>
  [place.name, ...(place.aliases ?? [])].map((n) => ({ key: normalizePlace(n), place })),
);

/**
 * Finds the known place a user meant: an exact name or alias first, then the
 * closest spelling within the typo budget. Returns null when nothing is close,
 * so an unknown word is never guessed at.
 */
export function lookupPlace(typed: string | null | undefined): Place | null {
  const key = normalizePlace(typed ?? "");
  if (key.length < 3) return null;
  const exact = INDEX.find((e) => e.key === key);
  if (exact) return exact.place;
  const budget = typoBudget(key);
  if (budget === 0) return null;
  let best: { place: Place; d: number } | null = null;
  for (const e of INDEX) {
    const d = editDistance(key, e.key, budget);
    if (d <= budget && (!best || d < best.d)) best = { place: e.place, d };
  }
  return best?.place ?? null;
}

/** Closest of `candidates` to `typed` within the typo budget, or null. Used to forgive typos in places we DO have stays in. */
export function closestName(typed: string, candidates: readonly string[]): string | null {
  const key = normalizePlace(typed);
  if (key.length < 3) return null;
  const budget = typoBudget(key);
  let best: { name: string; d: number } | null = null;
  for (const name of candidates) {
    const k = normalizePlace(name);
    if (k === key) return name;
    if (budget === 0) continue;
    const d = editDistance(key, k, budget);
    if (d <= budget && (!best || d < best.d)) best = { name, d };
  }
  return best?.name ?? null;
}

/** Great-circle distance in kilometres. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
