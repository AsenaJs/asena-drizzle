<p width="%100" align="center">
  <img src="https://avatars.githubusercontent.com/u/179836938?s=200&v=4" width="150" align="center"/>
</p>

# @asenajs/asena-drizzle

[![Version](https://img.shields.io/npm/v/@asenajs/asena-drizzle.svg)](https://asena.sh/docs/packages/drizzle)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Bun Version](https://img.shields.io/badge/Bun-1.4%2B-blueviolet)](https://bun.sh)

Drizzle ORM integration for AsenaJS - `@Database` services, type-safe `@Repository` classes and declarative `@Transaction`s.

**Requirements:** Bun 1.4+, `@asenajs/asena` 0.11+, `drizzle-orm` 0.45.2+, and a driver (`pg` or `mysql2`; `bun-sql` needs none).

## Installation

```bash
bun add @asenajs/asena-drizzle drizzle-orm pg
```

## Quick Start

```typescript
import { AsenaDatabaseService, BaseRepository, Database, Repository } from '@asenajs/asena-drizzle';
import { eq } from 'drizzle-orm';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
});

@Database({
  type: 'postgresql',
  config: { connectionString: process.env.DATABASE_URL },
  name: 'MainDatabase',
})
export class MainDatabase extends AsenaDatabaseService {}

@Repository({ table: users, databaseService: 'MainDatabase' })
export class UserRepository extends BaseRepository<typeof users> {
  async findByEmail(email: string) {
    return this.findOne(eq(users.email, email));
  }
}
```

Inject `UserRepository` into a service with `@Inject(UserRepository)` and use the built-in methods (`create`, `findAll`, `paginate`, ...).

## Documentation

Full documentation: [asena.sh/docs/packages/drizzle](https://asena.sh/docs/packages/drizzle)

## Contributing

Contributions are welcome! Submit a Pull Request on [GitHub](https://github.com/AsenaJs/asena-drizzle).

## License

MIT
