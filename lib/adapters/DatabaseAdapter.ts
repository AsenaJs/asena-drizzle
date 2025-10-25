import { sql } from 'drizzle-orm';
import type { DatabaseConfig, DrizzleConfig } from '../types';

export abstract class DatabaseAdapter<T> {
  protected _connection: T | null = null;

  protected config: DatabaseConfig;

  protected drizzleConfig?: DrizzleConfig;

  protected constructor(config: DatabaseConfig, drizzleConfig?: DrizzleConfig) {
    this.config = config;
    this.drizzleConfig = drizzleConfig;
  }

  public async testConnection(): Promise<boolean> {
    try {
      if (!this._connection) {
        throw new Error('No connection available');
      }

      // Try to execute a simple query
      await (this._connection as any).execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }

  protected createConnectionString(): string {
    const { host, port, database, user, password, ssl } = this.config;

    if (this.config.connectionString) {
      return this.config.connectionString;
    }

    // Default to PostgreSQL format, override in specific adapters
    const sslParam = ssl ? '?ssl=true' : '';

    return `postgresql://${user}:${password}@${host}:${port}/${database}${sslParam}`;
  }

  public abstract connect(): Promise<T>;

  public abstract disconnect(): Promise<void>;

  public get connection(): T {
    if (!this._connection) {
      throw new Error('Database connection not established. Call connect() first.');
    }

    return this._connection;
  }
}
