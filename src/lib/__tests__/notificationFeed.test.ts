import { describe, expect, it } from "vitest";
import { mergeNotificationRow } from "../notificationFeed";
import type { NotificationRow } from "../notificationRules";

const row = (id: number, created_at: string, is_read = false): NotificationRow => ({
  id, user_id: "user-1", template_id: null, title: `Notification ${id}`,
  message: "Test", type: "booking_guest", metadata: null, is_read, created_at,
});

describe("notification feed merging", () => {
  it("upserts realtime updates without duplicates", () => {
    const result = mergeNotificationRow([row(1, "2026-10-06T10:00:00Z")], row(1, "2026-10-06T10:00:00Z", true));
    expect(result).toHaveLength(1);
    expect(result[0].is_read).toBe(true);
  });

  it("keeps newest notifications first and caps history", () => {
    const result = mergeNotificationRow([row(1, "2026-10-06T10:00:00Z")], row(2, "2026-10-06T11:00:00Z"), 1);
    expect(result.map((item) => item.id)).toEqual([2]);
  });
});
