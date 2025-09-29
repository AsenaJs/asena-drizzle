# @asenajs/asena-drizzle

Drizzle ORM utilities for AsenaJS - A powerful and type-safe database integration package that provides generic Database services and Repository patterns.

## Features

- 🚀 **Generic Database Service** - Support for multiple database types (PostgreSQL, MySQL, BunSQLite)
- 🎯 **Type-Safe Repository Pattern** - Full TypeScript support with inferred types
- 🏷️ **Decorator-Based Configuration** - Easy setup with `@Database` and `@Repository` decorators
- 🔧 **AsenaJS Integration** - Seamless IoC container integration
- 📦 **Multiple Database Support** - Connect to different databases simultaneously
- ⚡ **Performance Optimized** - Connection pooling and efficient query execution

## Installation

```bash
bun add @asenajs/asena-drizzle drizzle-orm
# For PostgreSQL
bun add pg
# For MySQL
bun add mysql2
```

## Quick Start

### 1. Database Service Setup

```typescript
import { Database } from '@asenajs/asena-drizzle';

@Database({
  type: 'postgresql',
  config: {
    host: 'localhost',
    port: 5432,
    database: 'myapp',
    user: 'postgres',
    password: 'password',
  },
  name: 'MainDatabase' // Optional: for multiple databases but we recommend using it
})
export class MyDatabase extends AsenaDatabaseService {}
```

### 2. Repository Setup

```typescript
import { BaseRepository, Repository } from '@asenajs/asena-drizzle';
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';

const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
});

@Repository({
  table: users,
  databaseService: 'MainDatabase',
})
export class UserRepository extends BaseRepository<typeof users> {
  
  async findByEmail(email: string) {
    return this.findOne(eq(users.email, email));
  }
}
```

### 3. Service Usage

```typescript
import { Service } from '@asenajs/asena/server';
import { Inject } from '@asenajs/asena/ioc';

@Service("UserService")
export class UserService {
  
  @Inject("UserRepository")
  private userRepository: UserRepository;

  async createUser(name: string, email: string) {
    return this.userRepository.create({ name, email });
  }

  async getAllUsers() {
    return this.userRepository.findAll();
  }

  async getUsersPaginated(page = 1, limit = 10) {
    return this.userRepository.paginate(page, limit);
  }
}
```

## Supported Database Types

- `postgresql` - PostgreSQL using pg (node-postgres) with connection pooling
- `mysql` - MySQL using mysql2
- `bun-sql` - BunSQL using Bun's SQL interface
- `sqlite` - SQLite (coming soon)

## Repository Methods

The `BaseRepository` provides the following built-in methods:

- `findById(id)` - Find record by ID
- `findAll(where?)` - Find all records with optional conditions
- `findOne(where)` - Find single record
- `create(data)` - Create new record
- `createMany(data[])` - Create multiple records
- `updateById(id, data)` - Update record by ID
- `update(where, data)` - Update records with conditions
- `deleteById(id)` - Delete record by ID
- `delete(where)` - Delete records with conditions
- `count()` - Count all records
- `countBy(where)` - Count records with conditions
- `paginate(page, limit, where?, orderBy?)` - Paginated results
- `exists(where)` - Check if record exists

## Advanced Usage

### Multiple Database Connections

```typescript
@Database({
  type: 'postgresql',
  config: { /* primary db config */ },
  name: 'PrimaryDB'
})
export class PrimaryDatabase extends AsenaDatabaseService {}

@Database({
  type: 'mysql',
  config: { /* analytics db config */ },
  name: 'AnalyticsDB'
})
export class AnalyticsDatabase extends AsenaDatabaseService {}

@Repository({
  table: users,
  databaseService: 'PrimaryDB',
})
export class UserRepository extends BaseRepository<typeof users> {}

@Repository({
  table: events,
  databaseService: 'AnalyticsDB',
})
export class EventRepository extends BaseRepository<typeof events> {}
```

### Connection String Usage

```typescript
@Database({
  type: 'postgresql',
  config: {
    connectionString: process.env.DATABASE_URL,
    host: '', port: 0, database: '', user: '', password: ''
  }
})
export class DatabaseFromURL extends AsenaDatabaseService {}
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.