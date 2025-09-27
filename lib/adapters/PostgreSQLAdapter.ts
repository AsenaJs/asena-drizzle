import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { DatabaseAdapter } from './DatabaseAdapter';
import type { DatabaseConfig, DrizzleConfig } from '../types';

export class PostgreSQLAdapter extends DatabaseAdapter<PostgresJsDatabase<any>> {

  private client: any | null = null;

  public constructor(config: DatabaseConfig, drizzleConfig?: DrizzleConfig) {
    super(config, drizzleConfig);
  }

  public async connect(): Promise<PostgresJsDatabase<any>> {
    try {
      // Dynamic import to avoid hard dependency
      let postgres: any;

      try {
        postgres = (await import('postgres' as any)).default;
      } catch {
        throw new Error('PostgreSQL adapter requires "postgres" package. Install it with: bun add postgres');
      }

      const connectionString = this.createConnectionString();

      this.client = postgres(connectionString, {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        username: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl ? 'require' : false,
      });

      this._connection = drizzle(this.client, {
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
    if (this.client) {
      await this.client.end();
      this.client = null;
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
