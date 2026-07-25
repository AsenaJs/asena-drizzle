import { describe, it, expect, mock } from 'bun:test';
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { BaseRepository, type DrizzleDatabase } from '../lib/Repository';
import { runWithTx } from '../lib/transaction/TransactionContext';

// Regression tests for the prototype-getter shadowing bug:
// the AsenaJS IoC container installs *own-property* getters for every
// `@Inject` target, so injecting onto `db` would shadow the ALS-aware
// prototype getter and break repository writes inside `@Transaction`.
//
// These tests do not boot the real container — they replay the only thing it
// does (`Object.defineProperty(instance, key, { get, configurable: true })`)
// against a hand-built repository so we can assert the contract independent
// of the rest of the framework.

const testUsers = pgTable('test_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
});

class TestUserRepository extends BaseRepository<typeof testUsers> {
  public setTable(table: typeof testUsers): void {
    this.table = table;
  }

  public setDatabaseServiceName(name: string | undefined): void {
    this.databaseServiceName = name;
  }
}

function fakePool(label: string): DrizzleDatabase {
  return { __label: label } as unknown as DrizzleDatabase;
}

function fakeTx(label: string): DrizzleDatabase {
  return { __label: label } as unknown as DrizzleDatabase;
}

describe('BaseRepository - IoC injection shadow regression', () => {
  it('injecting onto _db keeps the ALS-aware prototype getter live', async () => {
    const repo = new TestUserRepository();

    repo.setTable(testUsers);
    repo.setDatabaseServiceName('TestDb');

    const pool = fakePool('pool');

    // Replays Container#injectDependencies with the fixed target ('_db').
    Object.defineProperty(repo, '_db', {
      get: () => pool,
      enumerable: true,
      configurable: true,
    });

    expect(repo.db).toBe(pool);

    const tx = fakeTx('tx');

    await runWithTx('TestDb', tx, async () => {
      expect(repo.db).toBe(tx as unknown as DrizzleDatabase);
    });

    // Outside the ALS scope it must fall back to the pooled connection.
    expect(repo.db).toBe(pool);
  });

  it('injecting onto db (the broken pattern) shadows the prototype getter', async () => {
    const repo = new TestUserRepository();

    repo.setTable(testUsers);
    repo.setDatabaseServiceName('TestDb');

    const pool = fakePool('pool');

    // Replays Container#injectDependencies with the OLD broken target ('db'),
    // documenting the failure mode that the fix prevents.
    Object.defineProperty(repo, 'db', {
      get: () => pool,
      enumerable: true,
      configurable: true,
    });

    const tx = fakeTx('tx');

    await runWithTx('TestDb', tx, async () => {
      // Own-property `db` wins over the prototype getter -> ALS branch never runs.
      expect(repo.db).toBe(pool);
      expect(repo.db).not.toBe(tx as unknown as DrizzleDatabase);
    });
  });

  it('repo.transaction() binds the tx into ALS so nested repo.db sees it', async () => {
    const repo = new TestUserRepository();

    repo.setTable(testUsers);
    repo.setDatabaseServiceName('TestDb');

    const pool = fakePool('pool');
    const tx = fakeTx('tx');

    const transactionSpy = mock(async (cb: any) => cb(tx));

    Object.defineProperty(repo, '_db', {
      get: () =>
        ({
          ...pool,
          transaction: transactionSpy,
        }) as unknown as DrizzleDatabase,
      enumerable: true,
      configurable: true,
    });

    let observedInsideCallback: unknown;

    const result = await repo.transaction(async (innerTx) => {
      observedInsideCallback = repo.db;
      expect(innerTx).toBe(tx as unknown as DrizzleDatabase);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(observedInsideCallback).toBe(tx as unknown as DrizzleDatabase);
    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });

  it('repo.transaction() without a databaseServiceName still works (manual instances)', async () => {
    const repo = new TestUserRepository();

    repo.setTable(testUsers);
    // Intentionally NO setDatabaseServiceName — mimics a hand-built repo.

    const tx = fakeTx('tx');
    const transactionSpy = mock(async (cb: any) => cb(tx));

    Object.defineProperty(repo, '_db', {
      get: () => ({ transaction: transactionSpy }) as unknown as DrizzleDatabase,
      enumerable: true,
      configurable: true,
    });

    const result = await repo.transaction(async (innerTx) => {
      expect(innerTx).toBe(tx as unknown as DrizzleDatabase);
      return 42;
    });

    expect(result).toBe(42);
    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });
});
