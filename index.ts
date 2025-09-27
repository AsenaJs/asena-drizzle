// Core Services
export { AsenaDatabaseService } from './lib/DatabaseService';
export { BaseRepository, type TableWithId, type DrizzleDatabase } from './lib/Repository';

// Decorators
export { Database, Repository } from './lib/decorators';
export type { DatabaseDecoratorOptions, RepositoryDecoratorOptions } from './lib/decorators';

// Types
export type { 
  DatabaseConfig, 
  DrizzleConfig, 
  DatabaseType, 
  DatabaseOptions 
} from './lib/types';

// Adapters (for advanced usage)
export { 
  DatabaseAdapter, 
  BunSQLAdapter, 
  PostgreSQLAdapter, 
  MySQLAdapter 
} from './lib/adapters';
