// Simple database service with decorator
import { AsenaDatabaseService } from '../lib/DatabaseService';
import { Database } from '../lib/decorators';

@Database({
  type: 'bun-sql',
  config: {
    host: 'localhost',
    port: 5432,
    database: 'myapp',
    user: 'postgres',
    password: 'password',
  },
  name: 'MyDatabase', // Optional: for multiple database connections
})
export class MyDatabase extends AsenaDatabaseService {}

// Alternative: PostgreSQL database (using pg/node-postgres)
// Make sure to install: bun add pg
@Database({
  type: 'postgresql',
  config: {
    host: process.env["DB_HOST"] || 'localhost',
    port: parseInt(process.env["DB_PORT"] || '5432', 10),
    database: process.env["DB_NAME"] || 'myapp',
    user: process.env["DB_USER"] || 'postgres',
    password: process.env["DB_PASSWORD"] || 'password',
    ssl: process.env["NODE_ENV"] === 'production',
  },
  drizzleConfig: {
    logger: true, // Enable query logging
    schema: {}, // Your drizzle schema
  },
})
export class PostgresDatabase extends AsenaDatabaseService {}

// Alternative: Using connection string
@Database({
  type: 'postgresql',
  config: {
    connectionString: process.env["DATABASE_URL"] || 'postgresql://user:pass@localhost:5432/db',
    host: '', // Will be ignored when connectionString is provided
    port: 0,
    database: '',
    user: '',
    password: '',
  },
})
export class PostgresDatabaseFromURL extends AsenaDatabaseService {}
