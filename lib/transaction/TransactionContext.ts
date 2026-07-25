import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-async-context store that tracks the active Drizzle transaction for each
 * registered database service.
 *
 * Multiple databases can participate in the same async scope (one transaction
 * per database), which is why this is a `Map<databaseName, tx>` rather than a
 * single reference.
 */
export interface TxStore {
  byDatabase: Map<string, unknown>;
}

export const TransactionContext = new AsyncLocalStorage<TxStore>();

/**
 * Returns the active Drizzle transaction for the given database service name,
 * or `undefined` if we are not inside a `@Transaction` scope for that database.
 */
export function getActiveTx(databaseName: string): unknown | undefined {
  return TransactionContext.getStore()?.byDatabase.get(databaseName);
}

/**
 * Runs `fn` inside a new async context where `tx` is the active transaction
 * for `databaseName`. Transactions for other databases carried by the parent
 * scope are preserved — we copy the parent map before overriding the entry.
 */
export function runWithTx<R>(databaseName: string, tx: unknown, fn: () => R | Promise<R>): Promise<R> {
  const parent = TransactionContext.getStore();
  const next: TxStore = {
    byDatabase: new Map(parent?.byDatabase ?? []),
  };

  next.byDatabase.set(databaseName, tx);

  return Promise.resolve(TransactionContext.run(next, fn));
}
