import { describe, expect, test } from 'bun:test';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { AsenaServerFactory } from '@asenajs/asena';
import { Service } from '@asenajs/asena/decorators';
import { Inject } from '@asenajs/asena/decorators/ioc';
import { ComponentConstants } from '@asenajs/asena/ioc/constants';
import { getOwnTypedMetadata } from '@asenajs/asena/utils';
import { BaseRepository } from '../lib/Repository';
import { Repository } from '../lib/decorators/Repository';
import { Database } from '../lib/decorators/Database';
import { AsenaDatabaseService } from '../lib/DatabaseService';

/**
 * Guards the removal of the member/metadata copy loops from @Repository and @Database.
 *
 * The wrappers used to copy every metadata key off the target onto themselves. Because
 * `getMetadataKeys` walks the prototype chain while `getMetadata` returns only the nearest
 * value, that flattened inherited records onto the wrapper as *own* properties - and it ran
 * after the wrapper had already written its own. Two distinct failures, neither of which any
 * existing test could see, because `BaseRepository` declares no decorators of its own.
 */

const users = pgTable('wrapper_users', {
  id: uuid('id').primaryKey(),
  name: text('name'),
});

const bootWith = async (components: any[]) => {
  const logger: any = { info: () => {}, warn: () => {}, error: () => {}, profile: () => {} };
  const server: any = await AsenaServerFactory.create({ logger, components, headless: true });

  await server.start();

  return server;
};

@Service('WrapperDb')
class FakeDatabase {
  public connection = { __label: 'pool' };
}

@Service('AuditService')
class AuditService {
  public record(): string {
    return 'audited';
  }
}

@Repository({ table: users, databaseService: 'WrapperDb', name: 'InjectingRepository' })
class InjectingRepository extends BaseRepository<typeof users> {
  // Any @Inject at all on the repository is enough to trigger the old bug: the decorator
  // writes DependencyKey = { _db } onto the wrapper, then the copy loop overwrote it with the
  // target's own record - so `_db` was never injected and the first query threw
  // "Database connection not initialized", pointing at the decorator rather than the cause.
  @Inject('AuditService')
  private audit!: AuditService;

  public auditor(): AuditService {
    return this.audit;
  }
}

describe('@Repository wrapper metadata', () => {
  test('keeps its own _db injection when the repository declares an @Inject', async () => {
    const server = await bootWith([FakeDatabase, AuditService, InjectingRepository]);
    const repo: any = await server.coreContainer.container.resolve('InjectingRepository');

    expect(repo._db).toEqual({ __label: 'pool' });
  });

  test('still injects the repository’s own dependency', async () => {
    const server = await bootWith([FakeDatabase, AuditService, InjectingRepository]);
    const repo: any = await server.coreContainer.container.resolve('InjectingRepository');

    expect(repo.auditor().record()).toBe('audited');
  });

  test('@Transaction on a base class survives when the subclass declares its own', async () => {
    // The previous version of this test asserted `Reflect.getMetadata(...)` and never called
    // collectTransactionalMethods - so reverting that method to getOwnMetadata left it green,
    // and the failure it was supposed to guard could not even be expressed: with two maps in
    // the chain, getMetadata returns the NEAREST one.
    //
    // That is the real bug. A base class's @Transaction methods worked right up until the
    // concrete class declared one of its own, at which point the base's map was shadowed and
    // its methods quietly ran with autocommit - each write committing on its own, a mid-method
    // failure leaving partial rows, and the method returning normally.
    const { TRANSACTION_METADATA_KEY } = await import('../lib/transaction/TransactionOptions');
    const { TransactionPostProcessor } = await import('../lib/transaction/TransactionPostProcessor');

    abstract class AuditedBase extends BaseRepository<typeof users> {
      public async archive(): Promise<string> {
        return 'archived';
      }
    }

    @Repository({ table: users, databaseService: 'WrapperDb', name: 'ShadowingRepository' })
    class ShadowingRepository extends AuditedBase {
      public async register(): Promise<string> {
        return 'registered';
      }
    }

    Reflect.defineMetadata(TRANSACTION_METADATA_KEY, new Map([['archive', {}]]), AuditedBase);
    Reflect.defineMetadata(TRANSACTION_METADATA_KEY, new Map([['register', {}]]), ShadowingRepository);

    const collected = (new TransactionPostProcessor() as any).collectTransactionalMethods(ShadowingRepository);

    expect([...collected.keys()].sort()).toEqual(['archive', 'register']);
  });

  test('a subclass entry overrides the base entry for the same method name', async () => {
    const { TRANSACTION_METADATA_KEY } = await import('../lib/transaction/TransactionOptions');
    const { TransactionPostProcessor } = await import('../lib/transaction/TransactionPostProcessor');

    abstract class OptionBase extends BaseRepository<typeof users> {
      public async write(): Promise<void> {}
    }

    @Repository({ table: users, databaseService: 'WrapperDb', name: 'OverridingTxRepository' })
    class OverridingTxRepository extends OptionBase {}

    Reflect.defineMetadata(TRANSACTION_METADATA_KEY, new Map([['write', { database: 'Base' }]]), OptionBase);
    Reflect.defineMetadata(
      TRANSACTION_METADATA_KEY,
      new Map([['write', { database: 'Subclass' }]]),
      OverridingTxRepository,
    );

    const collected = (new TransactionPostProcessor() as any).collectTransactionalMethods(OverridingTxRepository);

    // Ancestors first, nearest wins - same rule as every other merged key.
    expect(collected.get('write')).toEqual({ database: 'Subclass' });
  });

  test('a class with no @Transaction anywhere collects nothing', async () => {
    const { TransactionPostProcessor } = await import('../lib/transaction/TransactionPostProcessor');

    class Plain {}

    const collected = (new TransactionPostProcessor() as any).collectTransactionalMethods(Plain);

    expect(collected.size).toBe(0);
  });
});

describe('@Database wrapper metadata', () => {
  test('a @Database extending another @Database keeps its own registered name', async () => {
    @Database({ type: 'bun-sql', config: { database: 'primary' }, name: 'PrimaryDb' } as any)
    class PrimaryDb extends AsenaDatabaseService {
      public label(): string {
        return 'primary';
      }
    }

    @Database({ type: 'bun-sql', config: { database: 'replica' }, name: 'ReplicaDb' } as any)
    class ReplicaDb extends PrimaryDb {}

    // The copy loop flattened the parent's NameKey onto the child, so both registered as
    // 'PrimaryDb': the container promoted the entry to an array, TransactionPostProcessor took
    // registry[0], and transactions committed against the wrong database. Silently.
    expect(getOwnTypedMetadata<string>(ComponentConstants.NameKey, PrimaryDb)).toBe('PrimaryDb');
    expect(getOwnTypedMetadata<string>(ComponentConstants.NameKey, ReplicaDb)).toBe('ReplicaDb');
  });

  test('the child still inherits the parent’s methods', () => {
    @Database({ type: 'bun-sql', config: { database: 'primary' }, name: 'ParentDb' } as any)
    class ParentDb extends AsenaDatabaseService {
      public label(): string {
        return 'parent';
      }
    }

    @Database({ type: 'bun-sql', config: { database: 'child' }, name: 'ChildDb' } as any)
    class ChildDb extends ParentDb {}

    const instance: any = new (ChildDb as any)();

    expect(instance.label()).toBe('parent');
    expect(instance instanceof ParentDb).toBe(true);
  });
});
