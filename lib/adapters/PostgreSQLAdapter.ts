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
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
        // Connection pool settings
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
      });

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

  protected createConnectionString(): string {
    if (this.config.connectionString) {
      return this.config.connectionString;
    }

    const { host, port, database, user, password, ssl } = this.config;
    const sslParam = ssl ? '?ssl=true' : '';

    return `postgresql://${user}:${password}@${host}:${port}/${database}${sslParam}`;
  }

}
