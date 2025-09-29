import { PostConstruct } from '@asenajs/asena/ioc';
import type { DatabaseOptions } from './types';
import type { DatabaseAdapter } from './adapters';
import { BunSQLAdapter, MySQLAdapter, PostgreSQLAdapter } from './adapters';

/**
 * Base class for database services providing Drizzle ORM integration.
 *
 * This abstract class handles:
 * - Automatic database connection on service initialization
 * - Connection lifecycle management (connect, test, disconnect)
 * - Multiple database adapter support (PostgreSQL, MySQL, BunSQL)
 * - Type-safe Drizzle ORM connection access
 *
 * Users should extend this class and use the @Database decorator to create
 * database service instances.
 *
 * @template T - The Drizzle database connection type (e.g., PostgresJsDatabase, MySql2Database)
 *
 * @example
 * ```typescript
 * @Database({
 *   type: 'postgresql',
 *   config: {
 *     host: 'localhost',
 *     port: 5432,
 *     database: 'myapp',
 *     user: 'postgres',
 *     password: 'password',
 *   }
 * })
 * export class MyDatabase extends AsenaDatabaseService {
 *   // Add custom database methods here if needed
 * }
 * ```
 */
export abstract class AsenaDatabaseService<T = any> {

  protected adapter: DatabaseAdapter<T> | null = null;

  protected options: DatabaseOptions | null = null;

  /**
   * Tests the database connection to ensure it's active and working.
   *
   * @returns {Promise<boolean>} True if connection is working, false if adapter is not initialized
   *
   * @example
   * ```typescript
   * const isConnected = await myDatabase.testConnection();
   * if (!isConnected) {
   *   console.error('Database connection failed');
   * }
   * ```
   */
  public async testConnection(): Promise<boolean> {
    if (!this.adapter) {
      return false;
    }

    return await this.adapter.testConnection();
  }

  /**
   * Disconnects from the database and cleans up resources.
   * Should be called when shutting down the application.
   *
   * @returns {Promise<void>}
   *
   * @example
   * ```typescript
   * // On application shutdown
   * await myDatabase.disconnect();
   * ```
   */
  public async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
    }
  }

  @PostConstruct()
  protected async onStart() {
    try {
      // Check if options are set before proceeding
      if (!this.options) {
        throw new Error('Database options not initialized. Make sure to use @Database decorator properly.');
      }

      // Create appropriate adapter based on database type
      this.adapter = this.createAdapter();

      // Connect to database
      await this.adapter.connect();

      // Log successful connection
      this.options.logger.info(
        `✅ Database Connected [${this.options.type.toUpperCase()}] ${this.options.config.name ? `- ${this.options.config.name}` : ''}`,
      );
    } catch (error) {
      this.options.logger.error('❌ Database connection failed:', error);
      throw new Error(`Database connection failed: ${error}`);
    }
  }

  /**
   * Gets the Drizzle ORM database connection instance.
   *
   * This property provides access to the fully typed Drizzle database instance
   * that can be used for executing queries.
   *
   * @returns {T} The Drizzle database connection instance
   * @throws {Error} If the database adapter is not initialized
   *
   * @example
   * ```typescript
   * // Access the connection in a service
   * class UserService {
   *   constructor(private db: MyDatabase) {}
   *
   *   async getUsers() {
   *     return await this.db.connection
   *       .select()
   *       .from(users)
   *       .where(eq(users.active, true));
   *   }
   * }
   * ```
   */
  public get connection(): T {
    if (!this.adapter) {
      throw new Error('Database adapter not initialized. Service may not have started properly.');
    }

    return this.adapter.connection;
  }

  // Method to set database options (for property injection compatibility)
  protected setDatabaseOptions(options: DatabaseOptions): void {
    this.options = options;
  }

  private createAdapter(): DatabaseAdapter<T> {
    if (!this.options) {
      throw new Error('Database options not initialized');
    }

    const { type, config, drizzleConfig } = this.options;

    switch (type) {
      case 'bun-sql':
        return new BunSQLAdapter(config, drizzleConfig) as any;

      case 'postgresql':
        return new PostgreSQLAdapter(config, drizzleConfig) as any;

      case 'mysql':
        return new MySQLAdapter(config, drizzleConfig) as any;

      case 'sqlite':
        // For future SQLite implementation
        throw new Error('SQLite adapter not implemented yet');

      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
  }

}
