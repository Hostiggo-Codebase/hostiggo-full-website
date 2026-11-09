import { describe, expect, it } from "vitest";
import {
  addOptimistic,
  applyIncoming,
  fromRow,
  markFailed,
  markPending,
  mergeHistory,
  SUPPORT_CHAT_FALLBACK_URL,
  SUPPORT_SENDER_TYPE,
  type SupportPayload,
} from "../supportChat";

const ME = "user-1";
const payload = (over: Partial<SupportPayload> = {}): SupportPayload => ({
  id: "tmp-1", ticket_id: "t-1", sender_id: ME, sender_type: "user", body: "hello", created_at: "2026-10-08T10:00:00Z", ...over,
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

describe("history, failure handling and config", () => {
  it("sends as 'user' (the only customer type chat_messages accepts)", () => {
    expect(SUPPORT_SENDER_TYPE).toBe("user");
  });

  it("falls back to the production socket service", () => {
    expect(SUPPORT_CHAT_FALLBACK_URL).toBe("https://hostiggoadminportal-production.up.railway.app");
  });

  it("fromRow skips internal notes and marks own rows", () => {
    expect(fromRow(payload({ is_internal_note: true }), ME)).toBeNull();
    expect(fromRow(payload(), ME)).toMatchObject({ fromUser: true, text: "hello" });
    expect(fromRow(payload({ sender_id: "a", sender_type: "agent" }), ME)?.fromUser).toBe(false);
  });

  it("mergeHistory keeps unconfirmed sends and drops ones the history already has", () => {
    const history = [fromRow(payload({ id: "h1", body: "saved" }), ME)!];
    const prev = addOptimistic(
      addOptimistic([], "saved", "local-1", "2026-10-08T10:01:00Z"),
      "not yet",
      "local-2",
      "2026-10-08T10:02:00Z",
    );
    expect(mergeHistory(prev, history).map((m) => m.text)).toEqual(["saved", "not yet"]);
  });

  it("a failed message can be retried and is replaced by its echo", () => {
    let list = markFailed(addOptimistic([], "hi", "local-1"), "local-1");
    expect(list[0]).toMatchObject({ failed: true, pending: false });
    list = markPending(list, "local-1");
    expect(list[0]).toMatchObject({ failed: false, pending: true });
    list = markFailed(list, "local-1");
    expect(applyIncoming(list, payload({ id: "s1", body: "hi" }), ME)).toHaveLength(1);
  });
});
