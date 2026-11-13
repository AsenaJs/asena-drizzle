import { describe, expect, it, mock } from 'bun:test';
import { BaseRepository, type DrizzleDatabase } from '../lib/Repository';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';

const users = pgTable('missing_returning_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
});

class UserRepository extends BaseRepository<typeof users> {
  public attach(db: DrizzleDatabase): void {
    this.db = db;
    this.table = users;
  }
}

// MySQL builders have no .returning(): insert only offers $returningId(), and
// update/delete have no returning method at all.
function builderWithoutReturning(): DrizzleDatabase {
  const terminal = { execute: mock(async () => []) };

  return {
    select: mock(() => ({
      from: mock(() => ({ execute: mock(async () => []) })),
    })),
    insert: mock(() => ({ values: mock(() => terminal) })),
    update: mock(() => ({ set: mock(() => ({ where: mock(() => terminal) })) })),
    delete: mock(() => ({ where: mock(() => terminal) })),
    execute: mock(async () => ({ rows: [] })),
  };
}

// Pinned whole: the changeset quotes it, and toThrow(string) would only match a substring.
const missingReturning = new Error('Query builder does not support .returning() for this database driver');

describe('BaseRepository on a driver builder without .returning()', () => {
  const id = '00000000-0000-0000-0000-000000000001';

  it('create names the missing method', async () => {
    const repo = new UserRepository();
    repo.attach(builderWithoutReturning());

    await expect(repo.create({ name: 'Ada' })).rejects.toThrow(missingReturning);
  });

  it('createMany names the missing method', async () => {
    const repo = new UserRepository();
    repo.attach(builderWithoutReturning());

    await expect(repo.createMany([{ name: 'Ada' }])).rejects.toThrow(missingReturning);
  });

  it('updateById names the missing method', async () => {
    const repo = new UserRepository();
    repo.attach(builderWithoutReturning());

    await expect(repo.updateById(id, { name: 'Ada' })).rejects.toThrow(missingReturning);
  });

  it('update names the missing method', async () => {
    const repo = new UserRepository();
    repo.attach(builderWithoutReturning());

    await expect(repo.update(eq(users.name, 'Ada'), { name: 'Grace' })).rejects.toThrow(missingReturning);
  });

  it('deleteById names the missing method', async () => {
    const repo = new UserRepository();
    repo.attach(builderWithoutReturning());

    await expect(repo.deleteById(id)).rejects.toThrow(missingReturning);
  });

  it('delete names the missing method', async () => {
    const repo = new UserRepository();
    repo.attach(builderWithoutReturning());

    await expect(repo.delete(eq(users.name, 'Ada'))).rejects.toThrow(missingReturning);
  });
});
