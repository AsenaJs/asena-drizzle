import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import { DatabaseAdapter } from './DatabaseAdapter';
import type { DatabaseConfig, DrizzleConfig } from '../types';

export class MySQLAdapter extends DatabaseAdapter<MySql2Database<any>> {
  private client: any | null = null;

  public constructor(config: DatabaseConfig, drizzleConfig?: DrizzleConfig) {
    super(config, drizzleConfig);
  }

  public async connect(): Promise<MySql2Database<any>> {
    try {
      // Dynamic import to avoid hard dependency
      let mysql: any;

      try {
        mysql = (await import('mysql2/promise')).default;
      } catch {
        throw new Error('MySQL adapter requires "mysql2" package. Install it with: bun add mysql2');
      }

      this.client = mysql.createPool(this.buildDriverOptions());

      this._connection = drizzle(this.client, {
        schema: this.drizzleConfig?.schema,
        logger: this.drizzleConfig?.logger || false,
        mode: 'default',
      });

      // Test connection
      const isConnected = await this.testConnection();

      if (!isConnected) {
        throw new Error('Failed to establish database connection');
      }

      return this._connection;
    } catch (error) {
      throw new Error(`MySQL connection failed: ${error}`);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }

    this._connection = null;
  }

  /**
   * Builds the option object handed to mysql2's `createPool`.
   *
   * `connectionLimit` was a literal 10 here, so the pool size could not follow the workload.
   * It is now the default rather than the only possible value, and the timeouts - which mysql2
   * counts in milliseconds, like `DatabasePoolConfig` - pass straight through.
   *
   * `maxLifetimeMs` has no mysql2 counterpart and is deliberately not emulated; a caller who
   * needs connection recycling can reach for `extra`.
   *
   * mysql2 spells the connection string `uri`, not `connectionString` - the latter is not in its
   * `validOptions`, so it is logged as an invalid option and dropped. The discrete fields have to
   * be omitted alongside it, and not merely left to lose: mysql2 keeps any truthy discrete option
   * *over* the URI, so a config carrying both would resolve to the discrete host and port exactly
   * as it did before the connection string was honoured at all. `ssl`, `pool` and `extra` still
   * apply - and `ssl: false` here is deliberately falsy, which is what lets a URI's own ssl
   * parameter through while an explicit `ssl: true` still overrides it.
   */
  protected buildDriverOptions(): Record<string, unknown> {
    const { connectionString, pool = {}, extra } = this.config;

    return {
      ...(connectionString
        ? { uri: connectionString }
        : {
            host: this.config.host,
            port: this.config.port,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
          }),
      ssl: this.config.ssl ? {} : false,
      connectionLimit: pool.max ?? 10,
      queueLimit: 0,
      // Left unset by default so mysql2 keeps its own timeouts
      ...(pool.idleTimeoutMs !== undefined ? { idleTimeout: pool.idleTimeoutMs } : {}),
      ...(pool.connectTimeoutMs !== undefined ? { connectTimeout: pool.connectTimeoutMs } : {}),
      ...extra,
    };
  }
}
