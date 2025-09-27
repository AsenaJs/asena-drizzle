import { Service } from '@asenajs/asena/server';
import { PostConstruct } from '@asenajs/asena/ioc';
import type { DatabaseOptions } from './types';
import type { DatabaseAdapter} from './adapters';
import { BunSQLAdapter, MySQLAdapter, PostgreSQLAdapter } from './adapters';

@Service()
export abstract class AsenaDatabaseService<T = any> {

  protected adapter: DatabaseAdapter<T> | null = null;

  protected options: DatabaseOptions;

  public constructor(options: DatabaseOptions) {
    this.options = options;
  }

  public async testConnection(): Promise<boolean> {
    if (!this.adapter) {
      return false;
    }

    return await this.adapter.testConnection();
  }

  public async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
    }
  }

  @PostConstruct()
  protected async onStart() {
    try {
      // Create appropriate adapter based on database type
      this.adapter = this.createAdapter();

      // Connect to database
      await this.adapter.connect();

      // Log successful connection
      console.log(
        `✅ Database Connected [${this.options.type.toUpperCase()}] ${this.options.config.name ? `- ${this.options.config.name}` : ''}`,
      );
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw new Error(`Database connection failed: ${error}`);
    }
  }

  public get connection(): T {
    if (!this.adapter) {
      throw new Error('Database adapter not initialized. Service may not have started properly.');
    }

    return this.adapter.connection;
  }

  private createAdapter(): DatabaseAdapter<T> {
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
        throw new Error(`Unsupported database type: ${type}`);
    }
  }

}
