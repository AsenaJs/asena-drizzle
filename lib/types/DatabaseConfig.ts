import type { ServerLogger } from '@asenajs/asena/logger';

/**
 * Driver-agnostic connection pool settings.
 *
 * Every driver names these differently (`max` vs `connectionLimit`, seconds vs milliseconds),
 * so the pool is described once here and each adapter translates it into its own driver's
 * vocabulary. Durations are always milliseconds on this interface - the adapter converts where
 * the driver expects seconds.
 *
 * A field left undefined keeps the adapter's existing default, so adding a `pool` block never
 * changes anything the caller did not ask to change.
 *
 * The right size is a property of the process, not of the schema: an API serving concurrent
 * requests and a worker draining one job at a time can ship from the same image against the
 * same database and still need different numbers.
 *
 * @interface DatabasePoolConfig
 *
 * @property {number} [max] - Maximum number of connections the pool may open
 *                            (pg: `max` - default 20, mysql2: `connectionLimit` - default 10,
 *                            bun-sql: `max` - Bun's own default of 10)
 * @property {number} [idleTimeoutMs] - Close a connection after it has been idle this long
 * @property {number} [connectTimeoutMs] - Give up if a new connection takes longer than this
 * @property {number} [maxLifetimeMs] - Retire a connection once it reaches this age.
 *                                      Ignored by `mysql`: mysql2 has no equivalent option
 *
 * @example
 * ```typescript
 * const pool: DatabasePoolConfig = {
 *   max: 50,             // API process: many concurrent requests
 *   idleTimeoutMs: 10000,
 *   connectTimeoutMs: 2000,
 * };
 * ```
 */
export interface DatabasePoolConfig {
  max?: number;
  idleTimeoutMs?: number;
  connectTimeoutMs?: number;
  maxLifetimeMs?: number;
}

/**
 * Configuration for database connection.
 *
 * @interface DatabaseConfig
 *
 * @property {string} [host] - Database server hostname (e.g., 'localhost', 'db.example.com').
 *                             Unnecessary when `connectionString` is set - it is not emitted then
 * @property {number} [port] - Database server port (e.g., 5432 for PostgreSQL, 3306 for MySQL).
 *                             Unnecessary when `connectionString` is set
 * @property {string} [database] - Database name to connect to.
 *                                 Unnecessary when `connectionString` is set
 * @property {string} [user] - Database username for authentication.
 *                             Unnecessary when `connectionString` is set
 * @property {string} [password] - Database password for authentication.
 *                                 Unnecessary when `connectionString` is set
 * @property {boolean} [ssl] - Enable SSL/TLS connection (recommended for production)
 * @property {string} [connectionString] - Connection URL, honoured by every adapter. It replaces
 *                                         `host`/`port`/`database`/`user`/`password` entirely:
 *                                         when it is set none of them are handed to the driver,
 *                                         because no driver merges the two the same way (pg lets
 *                                         the URL win and falls back to its own defaults, mysql2
 *                                         lets the discrete fields win and ignores the URL). Each
 *                                         adapter emits it under its driver's own key -
 *                                         `connectionString` for `postgresql`, `uri` for `mysql`,
 *                                         `url` for `bun-sql`. `ssl`, `pool` and `extra` are
 *                                         unaffected and still apply
 * @property {string} [name] - Optional connection name for multiple database connections
 * @property {DatabasePoolConfig} [pool] - Driver-agnostic connection pool sizing and timeouts
 * @property {Record<string, unknown>} [extra] - Driver-native options spread into the driver's
 *                                               own option object, last, so they also win over
 *                                               everything this config produced. The escape
 *                                               hatch for anything not modelled here - it is
 *                                               passed through unvalidated and is not portable
 *                                               between database types
 *
 * @example
 * ```typescript
 * const config: DatabaseConfig = {
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'myapp',
 *   user: 'postgres',
 *   password: 'password',
 *   ssl: true,
 *   pool: { max: 50, idleTimeoutMs: 10000 },
 *   extra: { application_name: 'billing-api' } // pg-specific, passed straight through
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Connection string form: the discrete fields are left out entirely, not blanked out
 * const config: DatabaseConfig = {
 *   connectionString: process.env.DATABASE_URL,
 *   pool: { max: 50 } // still applies
 * };
 * ```
 */
export interface DatabaseConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  connectionString?: string;
  name?: string;
  pool?: DatabasePoolConfig;
  extra?: Record<string, unknown>;
}

/**
 * Configuration options for Drizzle ORM.
 *
 * @interface DrizzleConfig
 *
 * @property {string} [configPath] - Path to Drizzle configuration file
 * @property {any} [schema] - Drizzle schema object for type-safe queries
 * @property {boolean} [logger] - Enable SQL query logging
 *
 * @example
 * ```typescript
 * const drizzleConfig: DrizzleConfig = {
 *   logger: true, // Log all SQL queries
 *   schema: { users, posts } // Your Drizzle schema
 * };
 * ```
 */
export interface DrizzleConfig {
  configPath?: string;
  schema?: any;
  logger?: boolean;
}

/**
 * Supported database types.
 *
 * @typedef {('postgresql' | 'mysql' | 'sqlite' | 'bun-sql')} DatabaseType
 *
 * - `postgresql`: PostgreSQL database (via pg/node-postgres) with connection pooling
 * - `mysql`: MySQL database (via mysql2)
 * - `sqlite`: SQLite database (not yet implemented)
 * - `bun-sql`: Bun's native SQL client for PostgreSQL
 */
export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | 'bun-sql';

/**
 * Complete database configuration options for the @Database decorator.
 *
 * @interface DatabaseOptions
 *
 * @property {DatabaseType} type - Type of database to connect to
 * @property {DatabaseConfig} config - Database connection configuration
 * @property {DrizzleConfig} [drizzleConfig] - Optional Drizzle ORM configuration
 * @property {ServerLogger} [logger] - Optional custom logger (defaults to console)
 *
 * @example
 * ```typescript
 * const options: DatabaseOptions = {
 *   type: 'postgresql',
 *   config: {
 *     host: 'localhost',
 *     port: 5432,
 *     database: 'myapp',
 *     user: 'postgres',
 *     password: 'password'
 *   },
 *   drizzleConfig: {
 *     logger: true
 *   }
 * };
 * ```
 */
export interface DatabaseOptions {
  type: DatabaseType;
  config: DatabaseConfig;
  drizzleConfig?: DrizzleConfig;
  logger?: ServerLogger;
}
