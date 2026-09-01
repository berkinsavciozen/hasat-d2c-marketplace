// F2 Recipe Automation — Step 05 test support (not shipped to any Edge Function).
//
// A minimal, in-memory stand-in for the subset of the supabase-js query builder job-lock.ts/
// job-state.ts/telemetry.ts/stage-dispatch.ts actually use: from().update()/.insert().eq()/.in()/
// .or().select().maybeSingle()/.single(), and rpc(). It is NOT a PostgREST reimplementation —
// there is no real Deno/PostgREST stack available in this sandbox (see the infra README) — but it
// enforces the same WHERE-clause semantics those modules depend on (an update only touches rows
// matching every chained predicate), which is exactly what the CAS/atomic-claim tests need to
// exercise real races: two sequential claimJob() calls against the same in-memory row genuinely
// only let one through, the same way two concurrent PostgREST UPDATEs against the same Postgres
// row would.
export interface FakeQueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

function parseOrExpr(expr: string): Predicate {
  const preds = expr.split(",").map(parseClause);
  return (row) => preds.some((p) => p(row));
}

function parseClause(clause: string): Predicate {
  const [col, op, ...rest] = clause.split(".");
  const val = rest.join(".");
  if (op === "is") {
    return (row) => (val === "null" ? row[col] === null || row[col] === undefined : row[col] === val);
  }
  if (op === "lt") {
    return (row) => {
      const v = row[col];
      return typeof v === "string" && v < val;
    };
  }
  throw new Error(`fake-supabase-client: unsupported or() operator "${op}"`);
}

class FakeTable {
  rows = new Map<string, Row>();
  /** One-shot error injected by `FakeSupabaseClient.failNextInsert()` — consumed by the very next
   * `.insert()` against this table, then cleared, so a test can force exactly one insert failure
   * (e.g. an FK violation) without the fake client needing a real constraint engine. */
  pendingInsertError: { message: string; code?: string } | null = null;
}

class FakeQueryBuilder<T = Row> {
  private mode: "select" | "update" | "insert" = "select";
  private patch: Row | null = null;
  private insertRows: Row[] | null = null;
  private predicates: Predicate[] = [];
  private orderCol: string | null = null;
  private orderAscending = true;
  private limitN: number | null = null;

  private table: FakeTable;

  constructor(table: FakeTable) {
    this.table = table;
  }

  update(patch: Row): this {
    this.mode = "update";
    this.patch = patch;
    return this;
  }

  /** Mirrors supabase-js's `.insert(row)` / `.insert(rows[])` — a single object or a bulk array. */
  insert(rowOrRows: Row | Row[]): this {
    this.mode = "insert";
    this.insertRows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
    return this;
  }

  eq(col: string, val: unknown): this {
    this.predicates.push((row) => row[col] === val);
    return this;
  }

  in(col: string, vals: readonly unknown[]): this {
    this.predicates.push((row) => vals.includes(row[col]));
    return this;
  }

  /** Mirrors supabase-js's `.is(col, null)` — the only value real callers in this pipeline ever
   * pass (an IS NULL check; `.is(col, true/false)` is not used anywhere this fake backs). Treats a
   * genuinely-absent key the same as an explicit `null`, matching Postgres' own IS NULL semantics. */
  is(col: string, val: null): this {
    this.predicates.push((row) => row[col] === val || row[col] === undefined);
    return this;
  }

  or(expr: string): this {
    this.predicates.push(parseOrExpr(expr));
    return this;
  }

  select(_cols?: string): this {
    return this;
  }

  /** Mirrors supabase-js's `.order(col, { ascending })` — applied (along with `.limit()`) to
   * every terminal read below (`maybeSingle`/`single`/direct-await list), not just one of them,
   * so "the row with the highest version" (`.order('version', {ascending:false}).limit(1)`) works
   * the same way regardless of which terminal a caller happens to use. */
  order(col: string, opts: { ascending?: boolean } = {}): this {
    this.orderCol = col;
    this.orderAscending = opts.ascending ?? true;
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  async maybeSingle(): Promise<FakeQueryResult<T>> {
    const { data, error } = await this.executeList();
    if (error) return { data: null, error };
    return { data: (data?.[0] as T) ?? null, error: null };
  }

  async single(): Promise<FakeQueryResult<T>> {
    const result = await this.maybeSingle();
    if (!result.data && !result.error) {
      return { data: null, error: { message: "no rows returned for single()" } };
    }
    return result;
  }

  /** Makes the builder itself awaitable (`const { data, error } = await client.from(...).select()...`)
   * without a trailing `.maybeSingle()`/`.single()` — the real supabase-js query builder is a
   * PromiseLike too, and callers that want every matching row (not just the first) rely on that,
   * e.g. loading prior-QA history or duplicate candidates. */
  then<TResult1 = FakeQueryResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: FakeQueryResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.executeList().then(onfulfilled, onrejected);
  }

  private async executeList(): Promise<FakeQueryResult<T[]>> {
    if (this.mode === "insert") {
      if (this.table.pendingInsertError) {
        const error = this.table.pendingInsertError;
        this.table.pendingInsertError = null;
        return { data: null, error };
      }
      const rows = (this.insertRows ?? []).map((insertRow) => {
        const row: Row = { id: crypto.randomUUID(), ...insertRow };
        this.table.rows.set(row.id as string, row);
        return row;
      });
      return { data: rows as T[], error: null };
    }

    let matches = [...this.table.rows.values()].filter((row) =>
      this.predicates.every((p) => p(row))
    );

    if (this.mode === "update") {
      if (matches.length === 0) return { data: [], error: null };
      const updated = matches.map((row) => {
        const newRow = { ...row, ...this.patch };
        this.table.rows.set(row.id as string, newRow);
        return newRow;
      });
      return { data: updated as T[], error: null };
    }

    if (this.orderCol) {
      const col = this.orderCol;
      const dir = this.orderAscending ? 1 : -1;
      matches = [...matches].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av === bv) return 0;
        return (av! > bv! ? 1 : -1) * dir;
      });
    }
    if (this.limitN !== null) matches = matches.slice(0, this.limitN);

    return { data: matches as T[], error: null };
  }
}

type RpcHandler = (
  args: Record<string, unknown>,
) => FakeQueryResult<unknown> | Promise<FakeQueryResult<unknown>>;

export class FakeSupabaseClient {
  private tables = new Map<string, FakeTable>();
  private rpcHandlers = new Map<string, RpcHandler>();

  private table(name: string): FakeTable {
    let t = this.tables.get(name);
    if (!t) {
      t = new FakeTable();
      this.tables.set(name, t);
    }
    return t;
  }

  from(name: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this.table(name));
  }

  /** Test setup: seed rows into a table, keyed by their own `id`. */
  seed(tableName: string, rows: Row[]): void {
    const t = this.table(tableName);
    for (const row of rows) t.rows.set(row.id as string, row);
  }

  /** Test setup: makes the very next `.insert()` against `tableName` fail with `error` (e.g. an
   * FK-violation-shaped `{ message, code: "23503" }`), then reverts to normal behavior. */
  failNextInsert(tableName: string, error: { message: string; code?: string }): void {
    this.table(tableName).pendingInsertError = error;
  }

  getRow(tableName: string, id: string): Row | null {
    return this.table(tableName).rows.get(id) ?? null;
  }

  /** Test setup: register a canned response/behavior for client.rpc(name, args). */
  onRpc(name: string, handler: RpcHandler): void {
    this.rpcHandlers.set(name, handler);
  }

  async rpc(name: string, args: Record<string, unknown> = {}): Promise<FakeQueryResult<unknown>> {
    const handler = this.rpcHandlers.get(name);
    if (!handler) {
      return { data: null, error: { message: `fake-supabase-client: no rpc handler for "${name}"` } };
    }
    return await handler(args);
  }
}
