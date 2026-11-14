import { describe, expect, it, mock } from 'bun:test';
import { BaseRepository, type DrizzleDatabase } from '../lib/Repository';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';

const users = pgTable('missing_builder_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
});

class UserRepository extends BaseRepository<typeof users> {
  public attach(db: DrizzleDatabase): void {
    this.db = db;
    this.table = users;
  }
}

// Builds a select chain whose `from` result carries only the given methods.
// `execute` returns one count row so that paginate gets past its countBy call.
function databaseWithSelectBuilder(builder: Record<string, unknown>): DrizzleDatabase {
  return {
    select: mock(() => ({
      from: mock(() => ({ execute: mock(async () => [{ count: 0 }]), ...builder })),
    })),
    insert: mock(() => ({ values: mock(() => ({ execute: mock(async () => []) })) })),
    update: mock(() => ({ set: mock(() => ({ where: mock(() => ({ execute: mock(async () => []) })) })) })),
    delete: mock(() => ({ where: mock(() => ({ execute: mock(async () => []) })) })),
    execute: mock(async () => ({ rows: [] })),
  };
}

const withoutWhere = databaseWithSelectBuilder({});
const withoutOrderBy = databaseWithSelectBuilder({ where: mock(() => ({ limit: mock(() => []) })) });
const withoutLimit = databaseWithSelectBuilder({
  where: mock(() => ({ limit: mock(() => []) })),
  orderBy: mock(() => ({ limit: mock(() => []) })),
});

describe('BaseRepository read paths on a driver builder missing a method', () => {
  const id = '00000000-0000-0000-0000-000000000001';
  const condition = eq(users.name, 'Ada');

  it('findById names the missing .where()', async () => {
    const repo = new UserRepository();
    repo.attach(withoutWhere);

    await expect(repo.findById(id)).rejects.toThrow('does not support .where()');
  });

  it('findAll names the missing .where() when filtering', async () => {
    const repo = new UserRepository();
    repo.attach(withoutWhere);

    await expect(repo.findAll(condition)).rejects.toThrow('does not support .where()');
  });

  it('findOne names the missing .where()', async () => {
    const repo = new UserRepository();
    repo.attach(withoutWhere);

    await expect(repo.findOne(condition)).rejects.toThrow('does not support .where()');
  });

  it('countBy names the missing .where() when filtering', async () => {
    const repo = new UserRepository();
    repo.attach(withoutWhere);

    await expect(repo.countBy(condition)).rejects.toThrow('does not support .where()');
  });

  it('exists names the missing .where()', async () => {
    const repo = new UserRepository();
    repo.attach(withoutWhere);

    await expect(repo.exists(condition)).rejects.toThrow('does not support .where()');
  });

  it('paginate names the missing .orderBy()', async () => {
    const repo = new UserRepository();
    repo.attach(withoutOrderBy);

    await expect(repo.paginate(1, 10)).rejects.toThrow('does not support .orderBy()');
  });

  it('paginate names the missing .limit()', async () => {
    const repo = new UserRepository();
    repo.attach(withoutLimit);

    await expect(repo.paginate(1, 10)).rejects.toThrow('does not support .limit()');
  });
});
