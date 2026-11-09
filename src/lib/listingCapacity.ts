/**
 * Room-by-room capacity for the host listing wizard. The listing draft (and
 * POST /api/host/listings) still stores only totals -- numGuests, numBedrooms,
 * numBeds, numBathrooms -- so rooms are a UI breakdown that is summed on save.
 */
export type RoomCapacity = { guests: number; beds: number; bathrooms: number };
export type RoomField = keyof RoomCapacity;

/** Server limit for each total (validateDraft in /api/host/listings). */
export const CAPACITY_MAX = 50;
export const ROOM_MIN: RoomCapacity = { guests: 1, beds: 1, bathrooms: 0 };
const EXTRA_ROOM: RoomCapacity = { guests: 1, beds: 1, bathrooms: 0 };
const NEW_ROOM: RoomCapacity = { guests: 2, beds: 1, bathrooms: 1 };

export function capacityTotals(rooms: RoomCapacity[]) {
  return rooms.reduce(
    (acc, r) => ({
      numGuests: acc.numGuests + r.guests,
      numBeds: acc.numBeds + r.beds,
      numBathrooms: acc.numBathrooms + r.bathrooms,
      numBedrooms: acc.numBedrooms,
    }),
    { numGuests: 0, numBeds: 0, numBathrooms: 0, numBedrooms: rooms.length },
  );
}

/**
 * Rebuild rooms from saved totals so that re-opening the step reproduces the
 * same totals (rooms 2..n take the minimum, room 1 takes the remainder) --
 * otherwise every visit to the page would inflate the counts.
 */
export function roomsFromDraft(draft: {
  numGuests?: number | null;
  numBedrooms?: number | null;
  numBeds?: number | null;
  numBathrooms?: number | null;
}): RoomCapacity[] {
  const guests = draft.numGuests ?? 4;
  const beds = draft.numBeds ?? 3;
  const baths = draft.numBathrooms ?? 1;
  // Never create more rooms than there are guests/beds to share between them.
  const n = Math.max(1, Math.min(draft.numBedrooms ?? 1, guests, beds, CAPACITY_MAX));
  const rooms: RoomCapacity[] = [];
  for (let i = 1; i < n; i++) rooms.push({ ...EXTRA_ROOM });
  rooms.unshift({
    guests: Math.max(ROOM_MIN.guests, guests - (n - 1) * EXTRA_ROOM.guests),
    beds: Math.max(ROOM_MIN.beds, beds - (n - 1) * EXTRA_ROOM.beds),
    bathrooms: Math.max(ROOM_MIN.bathrooms, baths - (n - 1) * EXTRA_ROOM.bathrooms),
  });
  return rooms;
}

const TOTAL_KEY = { guests: "numGuests", beds: "numBeds", bathrooms: "numBathrooms" } as const;

export function canIncrement(rooms: RoomCapacity[], field: RoomField): boolean {
  return capacityTotals(rooms)[TOTAL_KEY[field]] < CAPACITY_MAX;
}

export function canDecrement(rooms: RoomCapacity[], index: number, field: RoomField): boolean {
  return (rooms[index]?.[field] ?? 0) > ROOM_MIN[field];
}

export function changeRoom(
  rooms: RoomCapacity[],
  index: number,
  field: RoomField,
  delta: 1 | -1,
): RoomCapacity[] {
  if (!rooms[index]) return rooms;
  if (delta > 0 ? !canIncrement(rooms, field) : !canDecrement(rooms, index, field)) return rooms;
  return rooms.map((r, i) => (i === index ? { ...r, [field]: r[field] + delta } : r));
}

export function canAddRoom(rooms: RoomCapacity[]): boolean {
  const t = capacityTotals(rooms);
  return (
    t.numBedrooms < CAPACITY_MAX &&
    t.numGuests + NEW_ROOM.guests <= CAPACITY_MAX &&
    t.numBeds + NEW_ROOM.beds <= CAPACITY_MAX &&
    t.numBathrooms + NEW_ROOM.bathrooms <= CAPACITY_MAX
  );
}

export function addRoom(rooms: RoomCapacity[]): RoomCapacity[] {
  return canAddRoom(rooms) ? [...rooms, { ...NEW_ROOM }] : rooms;
}

/** The first room can't be removed: every listing has at least one. */
export function removeRoom(rooms: RoomCapacity[], index: number): RoomCapacity[] {
  if (index <= 0 || rooms.length <= 1) return rooms;
  return rooms.filter((_, i) => i !== index);
}
