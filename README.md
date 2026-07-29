# @asenajs/asena-drizzle

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](https://github.com/AsenaJs/asena-drizzle#readme)
[![Bun Version](https://img.shields.io/badge/Bun-1.3.12%2B-blueviolet)](https://bun.sh)

Drizzle ORM utilities for AsenaJS - A powerful and type-safe database integration package that provides generic Database services and Repository patterns.

## Features

- 🚀 **Generic Database Service** - Support for multiple database types (PostgreSQL, MySQL, BunSQL)
- 🎯 **Type-Safe Repository Pattern** - Full TypeScript support with inferred types
- 🏷️ **Decorator-Based Configuration** - Easy setup with `@Database`, `@Repository`, `@Transaction`, and `@Drizzle` decorators
- 🔄 **Declarative Transactions** - `@Transaction` with `REQUIRED` / `NESTED` / `REQUIRES_NEW` propagation, propagated through `AsyncLocalStorage`
- 🔧 **AsenaJS Integration** - Seamless IoC container integration.
- 📦 **Multiple Database Support** - Connect to different databases simultaneously
- ⚡ **Performance Optimized** - Connection pooling and efficient query execution

## Requirements

- [Bun](https://bun.sh) v1.3.12 or higher
- [@asenajs/asena](https://github.com/AsenaJs/Asena) v0.10.0 or higher
- [drizzle-orm](https://orm.drizzle.team) v0.44 or higher

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

### 3. Activate the Transaction Post-Processor

If you want to use `@Transaction`, drop a one-liner `@Drizzle`-decorated class anywhere inside your project's source folder (typically `src/config/`). AsenaJS only scans your own source files — never `node_modules` — so the post-processor must be subclassed in your codebase to be discovered.

```typescript
// src/config/AppDrizzle.ts
import { Drizzle, TransactionPostProcessor } from '@asenajs/asena-drizzle';

@Drizzle({ defaultDb: 'MainDatabase' })
export class AppDrizzle extends TransactionPostProcessor {}
```

`defaultDb` lets single-database projects skip the `database` option on every `@Transaction`. You can omit it (`@Drizzle()`) if you'd rather always specify the database name explicitly.

### 4. Service Usage

```typescript
import { Service } from '@asenajs/asena/decorators';
import { Inject } from '@asenajs/asena/decorators/ioc';

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

## Transactions

Wrap any service method with `@Transaction` to run it inside a Drizzle transaction. Repository calls made from within the method automatically pick up the active transaction via `AsyncLocalStorage` — no explicit `tx` parameter passing required.

> **Setup required:** make sure you have a `@Drizzle`-decorated class in your source folder (see [Step 3 of Quick Start](#3-activate-the-transaction-post-processor)). Without it AsenaJS won't register the transaction post-processor and `@Transaction` will be a no-op.

```typescript
import { Service } from '@asenajs/asena/decorators';
import { Inject } from '@asenajs/asena/decorators/ioc';
import { Transaction } from '@asenajs/asena-drizzle';

@Service('AccountService')
export class AccountService {
    
  @Inject('UserRepository') 
  private userRepo: UserRepository;
  
  @Inject('AuditRepository') 
  private auditRepo: AuditRepository;

  // Uses defaultDb from @Drizzle({ defaultDb: 'MainDatabase' })
  @Transaction()
  async register(payload: { email: string; name: string }) {
    const user = await this.userRepo.create(payload);
    await this.auditRepo.create({ userId: user.id, event: 'register' });
    // If either insert throws, both rows roll back atomically.
    return user;
  }
}
```

### Propagation Modes

| Mode | Behavior |
|---|---|
| `REQUIRED` (default) | Joins the active transaction, or starts a new top-level one if none exists. |
| `NESTED` | Opens a `SAVEPOINT` inside the active transaction, or a new top-level one if none exists. Inner failures roll back to the savepoint without discarding the outer transaction. |
| `REQUIRES_NEW` | Always starts an independent top-level transaction. The outer transaction is suspended for the duration of the call. |

```typescript
@Transaction({ database: 'MainDatabase', propagation: 'NESTED', isolationLevel: 'serializable' })
async bestEffortAudit(userId: string) { /* ... */ }

@Transaction({ database: 'MainDatabase', propagation: 'REQUIRES_NEW' })
async writeAuditLog(event: AuditEvent) { /* survives outer rollback */ }
```

### Programmatic Transactions

When you need a transaction boundary inside a single method, use `BaseRepository#transaction(callback, options?)`:

```typescript
await this.userRepo.transaction(async () => {
  await this.userRepo.create(...);
  await this.profileRepo.create(...);
}, { isolationLevel: 'repeatable read' });
```

Inside an active `@Transaction` scope this opens a savepoint; outside, it starts a new top-level transaction.

> ⚠️ **Self-invocation:** `@Transaction` only wraps actual class methods. Arrow-function class properties (`run = async () => …`) are not intercepted. Use the standard `async method() { … }` syntax.

## Supported Database Types

- `postgresql` - PostgreSQL using pg (node-postgres) with connection pooling
- `mysql` - MySQL using mysql2
- `bun-sql` - BunSQL using Bun's SQL interface
- `sqlite` - SQLite (coming soon)

## Connection Pool Configuration

Pool size is a property of the process, not of the schema - an API serving concurrent requests and a worker draining one
job at a time can ship from the same image and still want different numbers. `config.pool` describes it once, in
driver-agnostic terms, and each adapter translates it into its own driver's vocabulary. Durations are always
milliseconds; the adapter converts where the driver counts in seconds.

```typescript
@Database({
  type: 'postgresql',
  config: {
    host: 'localhost',
    port: 5432,
    database: 'myapp',
    user: 'postgres',
    password: 'password',
    pool: {
      max: Number(process.env.DB_POOL_MAX ?? 20),
      idleTimeoutMs: 30000,
      connectTimeoutMs: 2000,
      maxLifetimeMs: 1800000,
    },
    // Anything not modelled above, passed straight to the driver (and applied last)
    extra: { application_name: 'billing-api' },
  },
})
export class MyDatabase extends AsenaDatabaseService {}
```

| `pool` field       | `postgresql` (pg)         | `mysql` (mysql2)  | `bun-sql` (Bun `SQL`)       |
| ------------------ | ------------------------- | ----------------- | --------------------------- |
| `max`              | `max` (default 20)        | `connectionLimit` (default 10) | `max` (Bun default 10) |
| `idleTimeoutMs`    | `idleTimeoutMillis` (default 30000) | `idleTimeout` | `idleTimeout` (seconds)     |
| `connectTimeoutMs` | `connectionTimeoutMillis` (default 2000) | `connectTimeout` | `connectionTimeout` (seconds) |
| `maxLifetimeMs`    | `maxLifetimeSeconds`      | not supported by mysql2 | `maxLifetime` (seconds) |

Every field is optional: leaving one out keeps the default shown above, so adding a `pool` block never changes anything
you did not ask it to change.

## Lifecycle

The database connects in an `@OnStart` hook - after every component is constructed, before the HTTP socket binds - and
releases the pool in an `@OnStop` hook when `server.stop()` runs. Nothing else needs to call `disconnect()`; this
matters most in test suites, where each file boots its own container and leaked pools accumulate until the database
refuses new clients.

## Repository Methods

The `BaseRepository` provides the following built-in methods:

- `findById(id)` - Find record by ID
- `findAll(where?)` - Find all records with optional conditions
- `findOne(where)` - Find single record
- `findBy(field, value)` - Find all records where `field === value` (shortcut)
- `create(data)` - Create new record
- `createMany(data[])` - Create multiple records
- `updateById(id, data)` - Update record by ID
- `update(where, data)` - Update records with conditions
- `updateMany(where, data)` - Alias of `update(where, data)`
- `deleteById(id)` - Delete record by ID
- `delete(where)` - Delete records with conditions
- `deleteMany(where)` - Alias of `delete(where)`
- `count()` - Count all records
- `countBy(where)` - Count records with conditions
- `paginate(page, limit, where?, orderBy?)` - Paginated results; falls back to `asc(table.id)` when `orderBy` is omitted so pages stay deterministic
- `exists(where)` - Check if record exists
- `existsBy(field, value)` - Check if a record where `field === value` exists (shortcut)
- `transaction(callback, options?)` - Run `callback` inside a transaction; opens a savepoint if already inside an active `@Transaction` scope

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

`connectionString` replaces `host`, `port`, `database`, `user` and `password` entirely - leave them out rather than
blanking them. Every adapter honours it, each under its own driver's key (`connectionString` for `postgresql`, `uri` for
`mysql`, `url` for `bun-sql`), and none of the five discrete fields is handed to the driver when it is set.

```typescript
@Database({
  type: 'postgresql',
  config: {
    connectionString: process.env.DATABASE_URL,
    pool: { max: 50 },
  },
})
export class DatabaseFromURL extends AsenaDatabaseService {}
```

Mixing the two is not a merge on any of the three drivers, which is why the adapters pick one: pg lets the URL win and
fills whatever it omits from its own defaults - never from your `port` - while mysql2 does the opposite and ignores the
URL wherever a discrete field is set. Emitting both would mean a different winner per database type.

`pool`, `ssl` and `extra` are unaffected and still apply. An `ssl` or `sslmode` in the query string wins for
`postgresql` - pg parses the URL over the rest of the options, so `config.ssl` only decides the cases the URL says
nothing about. For `mysql` the priority is the other way round: an explicit `ssl: true` beats the URI's own parameter.
One asymmetry worth knowing for the same reason: for `postgresql`, `extra: { host: 'x' }` cannot override a connection
string either; for `mysql` it can.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.