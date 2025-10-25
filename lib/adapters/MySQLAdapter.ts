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
        mysql = (await import('mysql2/promise' as any)).default;
      } catch {
        throw new Error('MySQL adapter requires "mysql2" package. Install it with: bun add mysql2');
      }

      this.client = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        ssl: this.config.ssl ? {} : false,
        connectionLimit: 10,
        queueLimit: 0,
      });

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

  protected createConnectionString(): string {
    if (this.config.connectionString) {
      return this.config.connectionString;
    }

    const { host, port, database, user, password, ssl } = this.config;
    const sslParam = ssl ? '?ssl=true' : '';

    return `mysql://${user}:${password}@${host}:${port}/${database}${sslParam}`;
  }
}
