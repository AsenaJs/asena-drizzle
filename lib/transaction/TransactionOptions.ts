/**
 * Transaction propagation strategy — subset of Spring's `@Transactional`
 * propagation modes selected to match what Drizzle's native API can express
 * without introducing connection juggling that hurts pool throughput.
 *
 * - `REQUIRED` (default): join the active transaction, or start a new one.
 * - `NESTED`: create a savepoint inside the active transaction (via
 *   `tx.transaction()`), or start a new top-level transaction if none exists.
 * - `REQUIRES_NEW`: suspend the active transaction (if any) and always run
 *   inside a brand-new top-level transaction.
 */
export type Propagation = 'REQUIRED' | 'NESTED' | 'REQUIRES_NEW';

/**
 * Isolation levels shared by PostgreSQL and MySQL via Drizzle's transaction
 * config. SQLite and some MySQL-family databases ignore unsupported values.
 */
export type TransactionIsolationLevel = 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';

export type TransactionAccessMode = 'read only' | 'read write';

export interface TransactionOptions {
  /**
   * Name of the `@Database` service to run the transaction against.
   *
   * When omitted, the {@link TransactionPostProcessor} auto-resolves it: if
   * exactly one `@Database` service is registered it is used, otherwise an
   * explicit name is required.
   */
  database?: string;

  /** Defaults to `REQUIRED`. */
  propagation?: Propagation;

  /** Forwarded to Drizzle's `db.transaction(cb, config)`. */
  isolationLevel?: TransactionIsolationLevel;

  /** Forwarded to Drizzle's `db.transaction(cb, config)`. */
  accessMode?: TransactionAccessMode;
}

/**
 * Metadata key used to collect `@Transaction`-annotated method configs on a
 * class. The value stored is a `Map<methodName, TransactionOptions>`.
 */
export const TRANSACTION_METADATA_KEY = Symbol.for('asena:drizzle:transaction:methods');
