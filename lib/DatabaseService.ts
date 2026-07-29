import { Inject, OnStart, OnStop } from '@asenajs/asena/decorators/ioc';
import { ICoreServiceNames } from '@asenajs/asena/ioc/types';
import type { ServerLogger } from '@asenajs/asena/logger';
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

  // Injected by AsenaJS IoC when the service is resolved by the container.
  // Used as the default logger when @Database was not given an explicit one.
  // The cast on the @Inject decorator is a no-op at runtime — the name is
  // always registered as a core service by CoreContainer.
  @Inject(ICoreServiceNames.SERVER_LOGGER)
  protected serverLogger?: ServerLogger;

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

  @OnStart()
  protected async onStart() {
    try {
      // Check if options are set before proceeding
      if (!this.options) {
        throw new Error('Database options not initialized. Make sure to use @Database decorator properly.');
      }

      // Resolve the runtime logger now that DI has completed:
      //   explicit option > AsenaJS ServerLogger (if available) > console.
      // The @Database decorator only guarantees that some logger is present
      // (it defaults to console); here we upgrade to the server logger when
      // the user did not supply one of their own.
      if (!this.options.logger || this.options.logger === console) {
        this.options.logger = this.serverLogger ?? console;
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

  @OnStop()
  protected async onStop() {
    // Until the framework grew a stop phase, nothing ever called disconnect() - the pool
    // outlived the server that opened it. That is invisible for a process that exits right
    // after, and fatal for a test run where every file boots its own container: the pools
    // accumulate until the database refuses new clients, and the failure surfaces in whichever
    // file happens to run last rather than in the one that leaked.
    await this.disconnect();

    // Reported after the fact: a failing hook is logged and skipped by the framework, so a
    // silent success is worth one line to make the release visible in the shutdown log.
    this.options?.logger?.info(
      `🔌 Database Disconnected [${this.options.type.toUpperCase()}] ${this.options.config.name ? `- ${this.options.config.name}` : ''}`,
    );
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
        throw new Error(`Unsupported database type: ${type as string}`);
    }
  }
}
