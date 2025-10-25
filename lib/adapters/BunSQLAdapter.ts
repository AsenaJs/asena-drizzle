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
      this.client = new SQL({
        database: this.config.database,
        password: this.config.password,
        username: this.config.user,
        port: this.config.port,
        hostname: this.config.host,
      });

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
}
