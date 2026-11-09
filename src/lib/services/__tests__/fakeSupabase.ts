// Minimal in-memory stand-in for the Supabase query builder, just enough for
// the booking-request code paths. It also mimics the two DB rules those paths
// lean on: the unique Razorpay ids and the availability guard that rejects a
// booking becoming CONFIRMED (status 2) on dates another confirmed booking holds.
type Row = Record<string, any>;
type Result = { data: any; error: any; count?: number | null };

const VALID_STATUS = new Set([1, 2, 3]);

export function createFakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));
  const counters: Record<string, number> = { bookings: 1000, notifications: 0, payment: 0 };

  const table = (name: string) => (tables[name] ??= []);
  const get = (row: Row, col: string) => {
    if (col.includes("->>")) {
      const [a, b] = col.split("->>");
      const v = row[a]?.[b];
      return v == null ? null : String(v);
    }
    return row[col];
  };

  function guardError(name: string, row: Row, patch: Row | null): Result | null {
    if (name !== "bookings") return null;
    const next = { ...row, ...(patch ?? {}) };
    if (next.status_id != null && !VALID_STATUS.has(next.status_id)) {
      return { data: null, error: { code: "23503", message: "booking_status fk" } };
    }
    if (next.status_id === 2) {
      const clash = table("bookings").some(
        (o) =>
          o !== row &&
          o.booking_id !== next.booking_id &&
          o.status_id === 2 &&
          o.listing_id === next.listing_id &&
          o.start_date < next.end_date &&
          o.end_date > next.start_date,
      );
      if (clash) return { data: null, error: { code: "P0001", message: "HOSTIGGO_DATES_UNAVAILABLE" } };
    }
    for (const col of ["razorpay_payment_id", "razorpay_order_id"]) {
      if (next[col] && table("bookings").some((o) => o !== row && o[col] === next[col])) {
        return { data: null, error: { code: "23505", message: `${col} unique` } };
      }
    }
    return null;
  }

  class Query implements PromiseLike<Result> {
    private filters: ((r: Row) => boolean)[] = [];
    private op: "select" | "insert" | "update" | "delete" = "select";
    private payload: any;
    private wantCount = false;
    private head = false;
    private returning = false;
    private mode: "many" | "single" | "maybe" = "many";
    private max = Infinity;
    constructor(private name: string) {}

    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (this.op === "select") {
        this.wantCount = Boolean(opts?.count);
        this.head = Boolean(opts?.head);
      } else {
        this.returning = true;
      }
      return this;
    }
    insert(p: any) { this.op = "insert"; this.payload = p; return this; }
    update(p: any) { this.op = "update"; this.payload = p; return this; }
    delete() { this.op = "delete"; return this; }
    eq(c: string, v: any) { this.filters.push((r) => get(r, c) === v); return this; }
    neq(c: string, v: any) { this.filters.push((r) => get(r, c) !== v); return this; }
    gt(c: string, v: any) { this.filters.push((r) => get(r, c) != null && get(r, c) > v); return this; }
    gte(c: string, v: any) { this.filters.push((r) => get(r, c) != null && get(r, c) >= v); return this; }
    lt(c: string, v: any) { this.filters.push((r) => get(r, c) != null && get(r, c) < v); return this; }
    lte(c: string, v: any) { this.filters.push((r) => get(r, c) != null && get(r, c) <= v); return this; }
    in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(get(r, c))); return this; }
    is(c: string, v: null) { this.filters.push((r) => (v === null ? get(r, c) == null : get(r, c) === v)); return this; }
    not(c: string, _op: string, _v: null) { this.filters.push((r) => get(r, c) != null); return this; }
    order() { return this; }
    range() { return this; }
    limit(n: number) { this.max = n; return this; }
    maybeSingle() { this.mode = "maybe"; return this; }
    single() { this.mode = "single"; return this; }

    private shape(rows: Row[]): Result {
      const out = rows.slice(0, this.max).map((r) => structuredClone(r));
      if (this.mode === "many") return { data: out, error: null };
      if (out.length > 1 && this.mode === "single") return { data: null, error: { code: "PGRST116", message: "multiple rows" } };
      if (out.length === 0) {
        return this.mode === "maybe" ? { data: null, error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
      }
      return { data: out[0], error: null };
    }

    private run(): Result {
      const rows = table(this.name);
      if (this.op === "select") {
        const matched = rows.filter((r) => this.filters.every((f) => f(r)));
        if (this.head) return { data: null, error: null, count: matched.length };
        const res = this.shape(matched);
        if (this.wantCount) res.count = matched.length;
        return res;
      }
      if (this.op === "insert") {
        const incoming: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
        const created: Row[] = [];
        for (const p of incoming) {
          const row: Row = { ...p };
          if (this.name === "bookings") {
            row.booking_id ??= ++counters.bookings;
            row.booked_at ??= new Date().toISOString();
          }
          if (this.name === "notifications") row.id ??= ++counters.notifications;
          const err = guardError(this.name, { ...row, booking_id: row.booking_id }, null);
          if (err) return err;
          rows.push(row);
          created.push(row);
        }
        return this.returning ? this.shape(created) : { data: null, error: null };
      }
      if (this.op === "update") {
        const matched = rows.filter((r) => this.filters.every((f) => f(r)));
        for (const r of matched) {
          const err = guardError(this.name, r, this.payload);
          if (err) return err;
        }
        for (const r of matched) Object.assign(r, this.payload);
        return this.returning ? this.shape(matched) : { data: null, error: null };
      }
      tables[this.name] = rows.filter((r) => !this.filters.every((f) => f(r)));
      return { data: null, error: null };
    }

    then<T1 = Result, T2 = never>(
      onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
    }
  }

  const client = {
    from: (name: string) => new Query(name),
    schema: () => client,
  };
  return { client, tables, table };
}
