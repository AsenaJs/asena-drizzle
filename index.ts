// Core Services
export { AsenaDatabaseService } from './lib/DatabaseService';
export { BaseRepository, type TableWithId, type DrizzleDatabase } from './lib/Repository';

// Decorators
export { Database, Repository, Transaction, Drizzle } from './lib/decorators';
export type { DatabaseDecoratorOptions, RepositoryDecoratorOptions } from './lib/decorators';

// Types
export type { DatabaseConfig, DatabasePoolConfig, DrizzleConfig, DatabaseType, DatabaseOptions } from './lib/types';

// Transaction subsystem
export {
  TransactionContext,
  TransactionPostProcessor,
  TRANSACTION_METADATA_KEY,
  DRIZZLE_OPTIONS_KEY,
  executeTransactional,
  getActiveTx,
  runWithTx,
  type Propagation,
  type TransactionAccessMode,
  type TransactionIsolationLevel,
  type TransactionOptions,
  type DrizzleOptions,
  type TxStore,
} from './lib/transaction';

// Adapters (for advanced usage)
export { DatabaseAdapter, BunSQLAdapter, PostgreSQLAdapter, MySQLAdapter } from './lib/adapters';
