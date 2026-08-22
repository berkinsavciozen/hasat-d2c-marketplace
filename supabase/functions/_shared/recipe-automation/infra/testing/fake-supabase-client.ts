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
}

class FakeQueryBuilder<T = Row> {
  private mode: "select" | "update" | "insert" = "select";
  private patch: Row | null = null;
  private insertRow: Row | null = null;
  private predicates: Predicate[] = [];

  private table: FakeTable;

  constructor(table: FakeTable) {
    this.table = table;
  }

  update(patch: Row): this {
    this.mode = "update";
    this.patch = patch;
    return this;
  }

  insert(row: Row): this {
    this.mode = "insert";
    this.insertRow = row;
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

  or(expr: string): this {
    this.predicates.push(parseOrExpr(expr));
    return this;
  }

  select(_cols?: string): this {
    return this;
  }

  async maybeSingle(): Promise<FakeQueryResult<T>> {
    return this.execute();
  }

  async single(): Promise<FakeQueryResult<T>> {
    const result = await this.execute();
    if (!result.data && !result.error) {
      return { data: null, error: { message: "no rows returned for single()" } };
    }
    return result;
  }

  private async execute(): Promise<FakeQueryResult<T>> {
    if (this.mode === "insert") {
      const row: Row = { id: crypto.randomUUID(), ...this.insertRow };
      this.table.rows.set(row.id as string, row);
      return { data: row as T, error: null };
    }

    const matches = [...this.table.rows.values()].filter((row) =>
      this.predicates.every((p) => p(row))
    );

    if (this.mode === "update") {
      if (matches.length === 0) return { data: null, error: null };
      const updated = matches.map((row) => {
        const newRow = { ...row, ...this.patch };
        this.table.rows.set(row.id as string, newRow);
        return newRow;
      });
      return { data: updated[0] as T, error: null };
    }

    return { data: (matches[0] as T) ?? null, error: null };
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
