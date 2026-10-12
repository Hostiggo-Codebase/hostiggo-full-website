import { describe, expect, it } from "vitest";
import {
  addRoom,
  canAddRoom,
  capacityTotals,
  changeRoom,
  removeRoom,
  roomsFromDraft,
  type RoomCapacity,
} from "../listingCapacity";

describe("roomsFromDraft", () => {
  it("uses the old defaults for a fresh draft", () => {
    expect(capacityTotals(roomsFromDraft({}))).toEqual({ numGuests: 4, numBeds: 3, numBathrooms: 1, numBedrooms: 1 });
  });

  it("round-trips saved totals instead of inflating them on revisit", () => {
    const draft = { numGuests: 6, numBedrooms: 3, numBeds: 4, numBathrooms: 2 };
    expect(capacityTotals(roomsFromDraft(draft))).toEqual(draft);
    const again = capacityTotals(roomsFromDraft(capacityTotals(roomsFromDraft(draft))));
    expect(again).toEqual(draft);
  });

  it("treats a legacy 0-bedroom (studio) draft as one room", () => {
    expect(roomsFromDraft({ numBedrooms: 0, numGuests: 2, numBeds: 1, numBathrooms: 1 })).toHaveLength(1);
  });
});

describe("changeRoom", () => {
  const rooms: RoomCapacity[] = [{ guests: 1, beds: 1, bathrooms: 0 }];

  it("respects per-room minimums", () => {
    expect(changeRoom(rooms, 0, "guests", -1)).toBe(rooms);
    expect(changeRoom(rooms, 0, "bathrooms", -1)).toBe(rooms);
    expect(changeRoom(rooms, 0, "bathrooms", 1)[0].bathrooms).toBe(1);
  });

  it("caps totals at the server limit of 50", () => {
    const full: RoomCapacity[] = [{ guests: 30, beds: 1, bathrooms: 0 }, { guests: 20, beds: 1, bathrooms: 0 }];
    expect(changeRoom(full, 1, "guests", 1)).toBe(full);
    expect(capacityTotals(changeRoom(full, 1, "guests", -1)).numGuests).toBe(49);
  });
});

describe("add/remove rooms", () => {
  it("adds a room and keeps the first one", () => {
    const two = addRoom(roomsFromDraft({}));
    expect(two).toHaveLength(2);
    expect(removeRoom(two, 0)).toBe(two);
    expect(removeRoom(two, 1)).toHaveLength(1);
  });

  it("won't add a room past the guest cap", () => {
    const rooms: RoomCapacity[] = [{ guests: 49, beds: 1, bathrooms: 0 }];
    expect(canAddRoom(rooms)).toBe(false);
    expect(addRoom(rooms)).toBe(rooms);
  });
});
