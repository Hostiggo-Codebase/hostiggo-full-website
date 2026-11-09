// Destination landing pages (/stays/<slug>). A destination only gets an indexable
// page while it has real, live inventory (MIN_INDEXABLE_LISTINGS) -- a page with
// one or two cards is thin content and would hurt more than help. Copy below is
// deliberately modest and factual; the numbers on each page (stay count, price)
// come live from the database, never from here.

export const MIN_INDEXABLE_LISTINGS = 3;

export type Destination = {
  slug: string;
  /** Display name used in headings and titles. */
  name: string;
  /** `locations.district` value(s) that feed this page (case-insensitive). */
  districts: string[];
  state: string;
  /** One-sentence answer-first summary of the place. */
  summary: string;
  /** What visitors typically come here for. */
  knownFor: string[];
  /** Extra sentence on where the stays sit, when the district differs from the name. */
  areaNote?: string;
  /** Slugs of other destinations to cross-link. */
  related: string[];
};

export const DESTINATIONS: Destination[] = [
  {
    slug: "bhopal",
    name: "Bhopal",
    districts: ["Bhopal"],
    state: "Madhya Pradesh",
    summary:
      "Bhopal is the capital of Madhya Pradesh, known as the City of Lakes for the Upper and Lower Lakes at its centre.",
    knownFor: ["The Upper Lake and Lower Lake", "Sanchi Stupa and Bhimbetka rock shelters nearby", "Old-city markets and Mughal-era mosques"],
    related: ["indore", "jaipur"],
  },
  {
    slug: "gurugram",
    name: "Gurugram",
    districts: ["Gurugram"],
    state: "Haryana",
    summary:
      "Gurugram is Haryana's corporate hub next to Delhi, close to Delhi's IGI Airport and a common base for business trips and short stays.",
    knownFor: ["Corporate offices and Cyber Hub", "Close to Delhi's IGI Airport", "Malls, restaurants and nightlife"],
    related: ["delhi", "jaipur"],
  },
  {
    slug: "shimla",
    name: "Shimla",
    districts: ["Shimla", "Kandaghat", "Narkanda"],
    state: "Himachal Pradesh",
    summary:
      "Shimla is the capital of Himachal Pradesh and a classic hill-station break, with stays across the town and the hill roads around it.",
    knownFor: ["The Ridge and Mall Road", "Colonial-era buildings", "Pine and deodar forest walks"],
    areaNote:
      "Our listings here include stays in Shimla town and in nearby hill places such as Kandaghat on the Kalka–Shimla road and Narkanda.",
    related: ["manali", "dehradun"],
  },
  {
    slug: "bengaluru",
    name: "Bengaluru",
    districts: ["Haralur", "Bengaluru", "Bangalore"],
    state: "Karnataka",
    summary:
      "Bengaluru is Karnataka's capital and India's best-known tech city; our stays sit in the Haralur area of south-east Bengaluru.",
    knownFor: ["Tech offices around Sarjapur Road and HSR Layout", "Cafés and breweries", "Pleasant weather through much of the year"],
    areaNote: "Our listings here are in and around Haralur, in south-east Bengaluru.",
    related: [],
  },
  {
    slug: "jammu",
    name: "Jammu",
    districts: ["Jammu"],
    state: "Jammu and Kashmir",
    summary:
      "Jammu, the winter capital of Jammu and Kashmir, is called the City of Temples and is the usual stop on the way to Vaishno Devi in Katra.",
    knownFor: ["Raghunath Temple and Bahu Fort", "Gateway to Vaishno Devi", "Road and rail links into Kashmir"],
    related: ["amritsar", "shimla"],
  },
  {
    slug: "varanasi",
    name: "Varanasi",
    districts: ["Varanasi"],
    state: "Uttar Pradesh",
    summary:
      "Varanasi is one of India's oldest living cities, built along the Ganges and known for its ghats, evening aarti and the Kashi Vishwanath temple.",
    knownFor: ["The Ganga ghats and evening aarti", "Kashi Vishwanath temple", "Sarnath, a short ride away"],
    related: ["agra", "jaipur"],
  },
  {
    slug: "dehradun",
    name: "Dehradun",
    districts: ["Dehradun"],
    state: "Uttarakhand",
    summary:
      "Dehradun is the capital of Uttarakhand, set in the Doon Valley and the usual gateway to Mussoorie and Rishikesh.",
    knownFor: ["Gateway to Mussoorie and Rishikesh", "Forest Research Institute", "Cooler weather and valley views"],
    related: ["shimla", "manali"],
  },
  {
    slug: "jodhpur",
    name: "Jodhpur",
    districts: ["Jodhpur"],
    state: "Rajasthan",
    summary:
      "Jodhpur is Rajasthan's Blue City, dominated by Mehrangarh Fort and known for its old-town lanes and desert-edge setting.",
    knownFor: ["Mehrangarh Fort", "The blue-washed old city", "Clock Tower market"],
    related: ["jaipur", "udaipur"],
  },
  {
    slug: "jaipur",
    name: "Jaipur",
    districts: ["Jaipur"],
    state: "Rajasthan",
    summary:
      "Jaipur is the Pink City and capital of Rajasthan, known for Amber Fort, the City Palace and its bazaars.",
    knownFor: ["Amber Fort and City Palace", "Hawa Mahal", "Bazaars for textiles and jewellery"],
    related: ["jodhpur", "agra"],
  },
];

export const DESTINATIONS_BY_SLUG: Record<string, Destination> = Object.fromEntries(
  DESTINATIONS.map((d) => [d.slug, d]),
);
