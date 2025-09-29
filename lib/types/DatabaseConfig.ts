import type { ServerLogger } from '@asenajs/asena/logger';

/**
 * Configuration for database connection.
 *
 * @interface DatabaseConfig
 *
 * @property {string} host - Database server hostname (e.g., 'localhost', 'db.example.com')
 * @property {number} port - Database server port (e.g., 5432 for PostgreSQL, 3306 for MySQL)
 * @property {string} database - Database name to connect to
 * @property {string} user - Database username for authentication
 * @property {string} password - Database password for authentication
 * @property {boolean} [ssl] - Enable SSL/TLS connection (recommended for production)
 * @property {string} [connectionString] - Optional connection string (overrides individual fields)
 * @property {string} [name] - Optional connection name for multiple database connections
 *
 * @example
 * ```typescript
 * const config: DatabaseConfig = {
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'myapp',
 *   user: 'postgres',
 *   password: 'password',
 *   ssl: true
 * };
 * ```
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  connectionString?: string;
  name?: string;
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
