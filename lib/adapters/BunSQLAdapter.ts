import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';
import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';
import { DatabaseAdapter } from './DatabaseAdapter';
import type { DatabaseConfig, DrizzleConfig } from '../types';

export class BunSQLAdapter extends DatabaseAdapter<BunSQLDatabase<any>> {
  private client: SQL | null = null;

  public constructor(config: DatabaseConfig, drizzleConfig?: DrizzleConfig) {
    super(config, drizzleConfig);
  }

  public async connect(): Promise<BunSQLDatabase<any>> {
    try {
      this.client = new SQL(this.buildDriverOptions());

      this._connection = drizzle({
        client: this.client,
        schema: this.drizzleConfig?.schema,
        logger: this.drizzleConfig?.logger || false,
      });

      // Test connection
      const isConnected = await this.testConnection();

      if (!isConnected) {
        throw new Error('Failed to establish database connection');
      }

      return this._connection;
    } catch (error) {
      throw new Error(`Database connection failed: ${error}`);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }

    this._connection = null;
  }

  /**
   * Builds the option object handed to Bun's `SQL` constructor.
   *
   * Kept separate from `connect()` because it is the whole contract with the driver: anything
   * missing here is unreachable configuration. This used to be a five-key literal built inline,
   * which is how `ssl`, `connectionString` and the pool size came to be silently dropped.
   *
   * Bun expresses its timeouts in seconds while `DatabasePoolConfig` is uniformly milliseconds,
   * so durations are divided on the way through. Fractional seconds are fine - Bun stores them
   * as milliseconds internally.
   */
  protected buildDriverOptions(): Bun.SQL.Options {
    const { ssl, connectionString, pool = {}, extra } = this.config;

    return {
      // A connection string carries host, credentials and database at once, so the discrete
      // fields would only contradict it.
      ...(connectionString
        ? { url: connectionString }
        : {
            database: this.config.database,
            password: this.config.password,
            username: this.config.user,
            port: this.config.port,
            hostname: this.config.host,
          }),
      // Only set when requested: forcing `tls: false` would override an sslmode carried by a
      // connection string.
      ...(ssl ? { tls: true } : {}),
      // Every pool key is omitted unless configured, leaving Bun's own defaults in place -
      // which is exactly what this adapter did before it could be configured at all.
      ...(pool.max !== undefined ? { max: pool.max } : {}),
      ...(pool.idleTimeoutMs !== undefined ? { idleTimeout: pool.idleTimeoutMs / 1000 } : {}),
      ...(pool.connectTimeoutMs !== undefined ? { connectionTimeout: pool.connectTimeoutMs / 1000 } : {}),
      ...(pool.maxLifetimeMs !== undefined ? { maxLifetime: pool.maxLifetimeMs / 1000 } : {}),
      ...extra,
    };
  }
}
