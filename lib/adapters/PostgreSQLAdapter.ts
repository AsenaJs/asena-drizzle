import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseAdapter } from './DatabaseAdapter';
import type { DatabaseConfig, DrizzleConfig } from '../types';

export class PostgreSQLAdapter extends DatabaseAdapter<NodePgDatabase<any>> {
  private pool: any | null = null;

  public constructor(config: DatabaseConfig, drizzleConfig?: DrizzleConfig) {
    super(config, drizzleConfig);
  }

  public async connect(): Promise<NodePgDatabase<any>> {
    try {
      // Dynamic import to avoid hard dependency
      let pg: any;

      try {
        pg = await import('pg');
      } catch {
        throw new Error('PostgreSQL adapter requires "pg" package. Install it with: bun add pg');
      }

      const { Pool } = pg.default || pg;

      // Create connection pool
      this.pool = new Pool(this.buildDriverOptions());

      this._connection = drizzle(this.pool, {
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
      throw new Error(`PostgreSQL connection failed: ${error}`);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }

    this._connection = null;
  }

  /**
   * Builds the option object handed to pg's `Pool` constructor.
   *
   * The pool numbers used to be literals here, which made them unreachable: the same image can
   * ship an API that wants many concurrent connections and a worker that wants a handful, and
   * neither could say so. The former literals are now the defaults, so an application that
   * configures nothing pools exactly as it did before.
   *
   * pg counts its two timeouts in milliseconds - the same unit as `DatabasePoolConfig` - but
   * expresses connection lifetime in seconds.
   *
   * A connection string replaces the five discrete fields outright instead of being merged with
   * them, because pg offers no merge to implement: it parses the URL over the whole option
   * object, so `{ port: 5555, connectionString: 'postgres://u:p@h/db' }` resolves to 5432 - pg's
   * own default for the key the URL omits - and never to 5555. Emitting both would also mean a
   * different winner per adapter: mysql2 resolves the same combination the other way round, in
   * favour of the discrete fields. `ssl`, `pool` and `extra` are unaffected and still apply.
   */
  protected buildDriverOptions(): Record<string, unknown> {
    const { connectionString, pool = {}, extra } = this.config;

    return {
      ...(connectionString
        ? { connectionString }
        : {
            host: this.config.host,
            port: this.config.port,
            database: this.config.database,
            user: this.config.user,
            password: this.config.password,
          }),
      // An `ssl`/`sslmode` carried by the connection string still wins over this: pg merges the
      // parsed URL over the config, so `ssl: false` here cannot force TLS off for such a URL.
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      // Connection pool settings
      max: pool.max ?? 20, // Maximum number of clients in the pool
      idleTimeoutMillis: pool.idleTimeoutMs ?? 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: pool.connectTimeoutMs ?? 2000, // Return an error after 2 seconds if connection cannot be established
      // pg has no lifetime cap by default; only opt in when asked to
      ...(pool.maxLifetimeMs !== undefined ? { maxLifetimeSeconds: pool.maxLifetimeMs / 1000 } : {}),
      ...extra,
    };
  }
}
