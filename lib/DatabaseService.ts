import { Inject, OnStart, OnStop } from '@asenajs/asena/decorators/ioc';
import { ICoreServiceNames } from '@asenajs/asena/ioc/types';
import { ComponentConstants } from '@asenajs/asena/ioc/constants';
import { getOwnTypedMetadata } from '@asenajs/asena/utils';
import type { Container } from '@asenajs/asena/container';
import type { ServerLogger } from '@asenajs/asena/logger';
import type { DatabaseOptions } from './types';
import type { DatabaseAdapter } from './adapters';
import { BunSQLAdapter, MySQLAdapter, PostgreSQLAdapter } from './adapters';
import { getActiveTx } from './transaction/TransactionContext';
import { verifyTransactionalMethodsAreWrapped } from './transaction/verifyTransactionalMethodsAreWrapped';

/**
 * Containers whose `@Transaction` methods have already been verified as wrapped. The check
 * walks every registered service, so with multiple `@Database` services it must still run
 * once per boot, not once per service.
 */
const containersWithVerifiedTransactions = new WeakSet<Container>();

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

  // The owning container, same injection point as TransactionPostProcessor uses. Optional
  // because hand-built instances (tests, manual wiring) have no container to inject.
  // Drives the once-per-container transaction boot guard below.
  @Inject(ICoreServiceNames.CONTAINER)
  protected container?: Container;

  // Set when onStart detected the Phase-A timing trap (see runTransactionBootGuard); the
  // first connection/rootConnection read then runs the guard it had to skip.
  private transactionBootGuardDeferred = false;

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
    // Deliberately outside the try/catch below: an unwrapped @Transaction method means
    // writes that should be atomic are not, and a boot that only logged that would look
    // healthy. The error aborts the start (LifecycleService rolls back what started).
    this.runTransactionBootGuard();

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
   * Transaction-aware: when called inside a `@Transaction`-wrapped method for this
   * database, the active transaction is returned; otherwise the pooled connection is.
   * This is what hand-written queries should use so they join the ambient transaction.
   *
   * @returns {T} The active transaction for this database, or the pooled connection
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
    this.runDeferredTransactionBootGuard();

    if (!this.adapter) {
      throw new Error('Database adapter not initialized. Service may not have started properly.');
    }

    // The @Database wrapper is the leaf class and carries its own registered name; a
    // hand-constructed service has none and can therefore never match an ALS entry.
    const databaseName = getOwnTypedMetadata<string>(ComponentConstants.NameKey, this.constructor);
    const activeTx = databaseName ? getActiveTx(databaseName) : undefined;

    if (activeTx !== undefined) {
      return activeTx as T;
    }

    return this.adapter.connection;
  }

  /**
   * Gets the pooled Drizzle connection, ignoring any ambient transaction.
   *
   * Only for STARTING a top-level transaction (what `@Transaction`'s REQUIRES_NEW and
   * `BaseRepository#transaction` do under the hood). Query code should use
   * {@link connection}, which joins the active transaction; calling this and writing
   * through it inside a transaction silently commits outside that transaction.
   *
   * @returns {T} The pooled Drizzle database connection instance
   * @throws {Error} If the database adapter is not initialized
   */
  public get rootConnection(): T {
    this.runDeferredTransactionBootGuard();

    if (!this.adapter) {
      throw new Error('Database adapter not initialized. Service may not have started properly.');
    }

    return this.adapter.connection;
  }

  /**
   * Runs the unwrapped-@Transaction check for this service's container, once per container.
   *
   * Timing trap: when this service is a dependency of a post-processor it is built in the
   * engine's Phase A, where start hooks run at construction - inside `prepareInstance`,
   * before `register` records the instance in `container.lifecycle` and before the remaining
   * components (the ones that still need wrapping) are registered. Checking at that moment
   * would report components that have not had their turn yet, so the check is deferred to
   * the first connection read instead, by which time registration is long finished.
   */
  private runTransactionBootGuard(): void {
    const container = this.container;

    if (!container || containersWithVerifiedTransactions.has(container)) return;

    const registered = container.lifecycle?.some((component) => component.instance === this);

    if (!registered) {
      this.transactionBootGuardDeferred = true;

      return;
    }

    containersWithVerifiedTransactions.add(container);
    verifyTransactionalMethodsAreWrapped(container);
  }

  private runDeferredTransactionBootGuard(): void {
    if (!this.transactionBootGuardDeferred) return;

    this.transactionBootGuardDeferred = false;

    const container = this.container;

    if (!container || containersWithVerifiedTransactions.has(container)) return;

    containersWithVerifiedTransactions.add(container);
    verifyTransactionalMethodsAreWrapped(container);
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
