type Row = Record<string, any>;
type TablesState = Record<string, Row[]>;

type OrderRule = {
  field: string;
  ascending: boolean;
};

type FilterRule = (row: Row) => boolean;

function cloneRow<T extends Row>(row: T): T {
  return JSON.parse(JSON.stringify(row));
}

function projectRow(row: Row, selectColumns: string | null) {
  if (!selectColumns || selectColumns === '*') return cloneRow(row);
  const keys = selectColumns
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
    .map((key) => key.split('(')[0]?.trim())
    .filter(Boolean);
  if (keys.length === 0) return cloneRow(row);
  const output: Row = {};
  for (const key of keys) {
    output[key] = row[key];
  }
  return output;
}

function makeError(message: string, code?: string) {
  return {
    message,
    code: code || 'MOCK_ERROR',
  };
}

class QueryBuilder {
  private tableName: string;
  private state: TablesState;
  private selectColumns: string | null = null;
  private orderRules: OrderRule[] = [];
  private limitCount: number | null = null;
  private offsetCount = 0;
  private filters: FilterRule[] = [];
  private mode: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  private insertPayload: Row[] = [];
  private updatePayload: Row | null = null;
  private upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } | null = null;
  private headOnly = false;
  private countMode: string | null = null;

  constructor(tableName: string, state: TablesState) {
    this.tableName = tableName;
    this.state = state;
  }

  select(columns?: string, options?: { head?: boolean; count?: string }) {
    this.selectColumns = columns?.trim() || '*';
    this.headOnly = options?.head === true;
    this.countMode = typeof options?.count === 'string' ? options.count : null;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.mode = 'insert';
    this.insertPayload = Array.isArray(payload) ? payload.map((row) => cloneRow(row)) : [cloneRow(payload)];
    return this;
  }

  update(values: Row) {
    this.mode = 'update';
    this.updatePayload = cloneRow(values);
    return this;
  }

  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mode = 'upsert';
    this.insertPayload = Array.isArray(values) ? values.map((row) => cloneRow(row)) : [cloneRow(values)];
    this.upsertOptions = options || null;
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  is(field: string, value: any) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  in(field: string, values: any[]) {
    const set = new Set(values || []);
    this.filters.push((row) => set.has(row[field]));
    return this;
  }

  not(field: string, operator: 'is', value: any) {
    if (operator === 'is') {
      this.filters.push((row) => row[field] !== value);
    }
    return this;
  }

  lt(field: string, value: any) {
    this.filters.push((row) => row[field] < value);
    return this;
  }

  gte(field: string, value: any) {
    this.filters.push((row) => row[field] >= value);
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderRules.push({
      field,
      ascending: options?.ascending !== false,
    });
    return this;
  }

  limit(value: number) {
    this.limitCount = Math.max(0, Math.floor(Number(value) || 0));
    return this;
  }

  range(from: number, to: number) {
    const start = Math.max(0, Math.floor(Number(from) || 0));
    const end = Math.max(start, Math.floor(Number(to) || 0));
    this.offsetCount = start;
    this.limitCount = end - start + 1;
    return this;
  }

  async maybeSingle() {
    const result = await this.execute();
    if (result.error) return { data: null, error: result.error };
    const rows = result.data || [];
    return { data: rows[0] || null, error: null };
  }

  async single() {
    const result = await this.execute();
    if (result.error) return { data: null, error: result.error };
    const rows = result.data || [];
    if (rows.length === 0) {
      return { data: null, error: makeError(`No rows in ${this.tableName}`) };
    }
    return { data: rows[0], error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any);
  }

  private getTable() {
    if (!this.state[this.tableName]) {
      this.state[this.tableName] = [];
    }
    return this.state[this.tableName];
  }

  private applyFilters(rows: Row[]) {
    return rows.filter((row) => this.filters.every((rule) => rule(row)));
  }

  private applyOrder(rows: Row[]) {
    if (this.orderRules.length === 0) return rows;
    const ordered = [...rows];
    ordered.sort((left, right) => {
      for (const rule of this.orderRules) {
        const a = left[rule.field];
        const b = right[rule.field];
        if (a === b) continue;
        if (a == null) return rule.ascending ? -1 : 1;
        if (b == null) return rule.ascending ? 1 : -1;
        if (a < b) return rule.ascending ? -1 : 1;
        if (a > b) return rule.ascending ? 1 : -1;
      }
      return 0;
    });
    return ordered;
  }

  private applyLimit(rows: Row[]) {
    const start = Math.max(0, this.offsetCount);
    if (this.limitCount == null) return rows.slice(start);
    return rows.slice(start, start + this.limitCount);
  }

  private ensureCreditLedgerUnique(rows: Row[]) {
    if (this.tableName !== 'credit_ledger') return null;
    for (const row of rows) {
      const key = String(row.idempotency_key || '').trim();
      if (!key) continue;
      const exists = this.getTable().some((candidate) => String(candidate.idempotency_key || '').trim() === key);
      if (exists) {
        return makeError('duplicate key value violates unique constraint', '23505');
      }
    }
    return null;
  }

  private ensureVariantUnique(rows: Row[]) {
    if (this.tableName !== 'source_item_blueprint_variants') return null;
    for (const row of rows) {
      const sourceItemId = String(row.source_item_id || '').trim();
      const generationTier = String(row.generation_tier || '').trim();
      if (!sourceItemId || !generationTier) continue;
      const exists = this.getTable().some((candidate) => (
        String(candidate.source_item_id || '').trim() === sourceItemId
        && String(candidate.generation_tier || '').trim() === generationTier
      ));
      if (exists) {
        return makeError('duplicate key value violates unique constraint', '23505');
      }
    }
    return null;
  }

  private async execute() {
    const table = this.getTable();
    const nowIso = new Date().toISOString();

    if (this.mode === 'insert') {
      const duplicateError = this.ensureCreditLedgerUnique(this.insertPayload);
      if (duplicateError) {
        return { data: null, error: duplicateError };
      }
      const variantDuplicateError = this.ensureVariantUnique(this.insertPayload);
      if (variantDuplicateError) {
        return { data: null, error: variantDuplicateError };
      }
      const inserted: Row[] = [];
      for (const payload of this.insertPayload) {
        const generatedId = this.tableName === 'generation_run_events'
          ? table.length + inserted.length + 1
          : `${this.tableName}_${table.length + inserted.length + 1}`;
        const row: Row = {
          id: payload.id || generatedId,
          created_at: payload.created_at || nowIso,
          updated_at: payload.updated_at || nowIso,
          ...payload,
        };
        table.push(row);
        inserted.push(projectRow(row, this.selectColumns));
      }
      return { data: inserted, error: null };
    }

    if (this.mode === 'update') {
      const payload = this.updatePayload || {};
      const matched = this.applyFilters(table);
      const updated: Row[] = [];
      for (const row of matched) {
        Object.assign(row, payload);
        if (!Object.prototype.hasOwnProperty.call(payload, 'updated_at')) {
          row.updated_at = nowIso;
        }
        updated.push(projectRow(row, this.selectColumns));
      }
      const count = this.countMode ? updated.length : null;
      const limited = this.applyLimit(this.applyOrder(updated));
      return { data: this.headOnly ? null : limited, error: null, count };
    }

    if (this.mode === 'upsert') {
      const upserted: Row[] = [];
      const onConflictFields = String(this.upsertOptions?.onConflict || '')
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean);

      for (const payload of this.insertPayload) {
        const row = cloneRow(payload);
        const existing = onConflictFields.length > 0
          ? table.find((candidate) => onConflictFields.every((field) => String(candidate[field] || '') === String(row[field] || '')))
          : null;

        if (existing) {
          if (this.upsertOptions?.ignoreDuplicates) continue;
          Object.assign(existing, row);
          if (!Object.prototype.hasOwnProperty.call(row, 'updated_at')) {
            existing.updated_at = nowIso;
          }
          upserted.push(projectRow(existing, this.selectColumns));
          continue;
        }

        const generatedId = `${this.tableName}_${table.length + upserted.length + 1}`;
        const nextRow: Row = {
          id: row.id || generatedId,
          created_at: row.created_at || nowIso,
          updated_at: row.updated_at || nowIso,
          ...row,
        };
        table.push(nextRow);
        upserted.push(projectRow(nextRow, this.selectColumns));
      }

      const limited = this.applyLimit(this.applyOrder(upserted));
      return { data: this.headOnly ? null : limited, error: null };
    }

    const filtered = this.applyFilters(table);
    const count = this.countMode ? filtered.length : null;
    const selected = this.applyLimit(this.applyOrder(filtered)).map((row) => projectRow(row, this.selectColumns));
    return { data: this.headOnly ? null : selected, error: null, count };
  }
}

export function createMockSupabase(
  initialTables?: Partial<TablesState>,
  options?: {
    rpcs?: Record<string, (args: any, state: TablesState) => Promise<{ data: any; error: any }> | { data: any; error: any }>;
  },
) {
  const state: TablesState = {
    user_credit_wallets: [],
    credit_ledger: [],
    source_item_unlocks: [],
    ingestion_jobs: [],
    generation_runs: [],
    generation_run_events: [],
    ...(initialTables || {}),
  };

  const client: Record<string, any> = {
    state,
    from(tableName: string) {
      return new QueryBuilder(tableName, state);
    },
  };

  if (options?.rpcs) {
    client.rpc = (name: string, args: any) => {
      const handler = options.rpcs?.[name];
      if (!handler) {
        return Promise.resolve({
          data: null,
          error: makeError(`RPC ${name} not found`, 'PGRST202'),
        });
      }
      try {
        return Promise.resolve(handler(args, state));
      } catch (error) {
        return Promise.reject(error);
      }
    };
  }

  return client;
}
