export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  connectionString?: string;
  name?: string; // For multiple database connections
}

export interface DrizzleConfig {
  configPath?: string;
  schema?: any;
  logger?: boolean;
}

export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | 'bun-sql';

export interface DatabaseOptions {
  type: DatabaseType;
  config: DatabaseConfig;
  drizzleConfig?: DrizzleConfig;
}
