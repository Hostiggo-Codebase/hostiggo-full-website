import { describe, expect, it } from "vitest";
import { addOptimistic, applyIncoming, ticketIdForUser, type SupportPayload } from "../supportChat";

const ME = "user-1";
const payload = (over: Partial<SupportPayload> = {}): SupportPayload => ({
  id: "tmp-1", ticket_id: ME, sender_id: ME, sender_type: "student", body: "hello", created_at: "2026-10-08T10:00:00Z", ...over,
});

describe("applyIncoming", () => {
  it("replaces the pending message with the server echo instead of showing it twice", () => {
    const pending = addOptimistic([], "hello", "local-1");
    const next = applyIncoming(pending, payload(), ME);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: "tmp-1", fromUser: true, text: "hello" });
    expect(next[0].pending).toBeUndefined();
  });

  it("appends a message from another device of the same user, and agent replies as 'not from me'", () => {
    const a = applyIncoming([], payload({ id: "tmp-2", body: "from my phone" }), ME);
    expect(a[0].fromUser).toBe(true);
    const b = applyIncoming(a, payload({ id: "srv-3", sender_id: "agent-9", sender_type: "agent", body: "How can I help?" }), ME);
    expect(b).toHaveLength(2);
    expect(b[1]).toMatchObject({ fromUser: false, text: "How can I help?" });
  });

  it("never shows the same server id twice", () => {
    const once = applyIncoming([], payload({ id: "dup" }), ME);
    expect(applyIncoming(once, payload({ id: "dup" }), ME)).toHaveLength(1);
  });

  it("drops internal agent notes and empty bodies", () => {
    expect(applyIncoming([], payload({ sender_type: "agent", sender_id: "a", is_internal_note: true }), ME)).toEqual([]);
    expect(applyIncoming([], payload({ body: "   " }), ME)).toEqual([]);
  });

  it("matches echoes to pending messages one at a time when the same text is sent twice", () => {
    let list = addOptimistic(addOptimistic([], "ok", "local-1"), "ok", "local-2");
    list = applyIncoming(list, payload({ id: "tmp-10", body: "ok" }), ME);
    expect(list.filter((m) => m.pending)).toHaveLength(1);
    list = applyIncoming(list, payload({ id: "tmp-11", body: "ok" }), ME);
    expect(list.filter((m) => m.pending)).toHaveLength(0);
    expect(list).toHaveLength(2);
  });
});

describe("ticketIdForUser", () => {
  it("gives every user their own room (never a shared literal)", () => {
    expect(ticketIdForUser("a")).not.toBe(ticketIdForUser("b"));
    expect(ticketIdForUser("a")).not.toBe("support");
  });
});
