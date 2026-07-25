import type { TransactionOptions } from './TransactionOptions';
import { getActiveTx, runWithTx } from './TransactionContext';

/**
 * Shape we need from any Drizzle database / transaction instance: the ability
 * to start a (possibly nested) transaction with a config object. We intentionally
 * keep this structural rather than importing dialect-specific types, because
 * pg/mysql/bun-sql expose slightly different `transaction()` signatures but all
 * honor `{ isolationLevel, accessMode }`.
 */
interface DrizzleTransactable {
  transaction<R>(callback: (tx: unknown) => Promise<R>, config?: Record<string, unknown>): Promise<R>;
}

function buildDrizzleTxConfig(options: TransactionOptions): Record<string, unknown> | undefined {
  const config: Record<string, unknown> = {};

  if (options.isolationLevel !== undefined) config['isolationLevel'] = options.isolationLevel;
  if (options.accessMode !== undefined) config['accessMode'] = options.accessMode;

  return Object.keys(config).length > 0 ? config : undefined;
}

/**
 * Runs `callback` inside an ALS scope that binds `tx` as the active transaction
 * for `databaseName`. This is how repository calls within the callback see the
 * transactional connection instead of the pooled one.
 */
async function withActiveTx<R>(databaseName: string, tx: unknown, callback: () => Promise<R>): Promise<R> {
  return runWithTx(databaseName, tx, callback);
}

/**
 * Core propagation matrix. Resolves the (propagation × existing-tx) combination
 * into the right Drizzle call and rebinds the ALS store so nested repository
 * operations see the correct transaction.
 *
 * The callers (TransactionPostProcessor and BaseRepository.transaction) pass in
 * the resolved top-level database instance via `resolveRootDb` so we do not need
 * to touch the IoC container from this hot path on every call.
 */
export async function executeTransactional<R>(params: {
  databaseName: string;
  options: TransactionOptions;
  resolveRootDb: () => DrizzleTransactable;
  body: () => Promise<R>;
}): Promise<R> {
  const { databaseName, options, resolveRootDb, body } = params;
  const propagation = options.propagation ?? 'REQUIRED';
  const existingTx = getActiveTx(databaseName) as DrizzleTransactable | undefined;
  const drizzleConfig = buildDrizzleTxConfig(options);

  if (existingTx) {
    switch (propagation) {
      case 'REQUIRED':
        // Join the existing transaction — ALS already carries it.
        return body();

      case 'NESTED':
        // Savepoint within the existing transaction.
        return existingTx.transaction(async (inner) => withActiveTx(databaseName, inner, body));

      case 'REQUIRES_NEW': {
        // Suspend the outer transaction: open a brand-new top-level transaction
        // on the root db. Drizzle will allocate a fresh connection from the
        // pool for this call.
        const rootDb = resolveRootDb();

        return rootDb.transaction(async (fresh) => withActiveTx(databaseName, fresh, body), drizzleConfig);
      }
    }
  }

  // No active transaction in this async scope — all three propagation modes
  // start a new top-level transaction.
  const rootDb = resolveRootDb();

  return rootDb.transaction(async (fresh) => withActiveTx(databaseName, fresh, body), drizzleConfig);
}
