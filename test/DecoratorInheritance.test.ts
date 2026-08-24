import { describe, expect, test } from 'bun:test';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { AsenaServerFactory } from '@asenajs/asena';
import { Service } from '@asenajs/asena/decorators';
import { BaseRepository } from '../lib/Repository';
import { Repository } from '../lib/decorators/Repository';
import { Database } from '../lib/decorators/Database';
import { AsenaDatabaseService } from '../lib/DatabaseService';

// Regression suite for decorator inheritance.
//
// @Repository and @Database do not augment the decorated class, they return a
// replacement. The replacement used to extend BaseRepository/AsenaDatabaseService
// instead of the target, and the member copy loops only walk the target's *own*
// prototype - so everything the decorated class inherited from an intermediate base
// class was dropped, silently, with no error until the first call.
//
// These tests boot the real container where they can, because the previous suites
// deliberately did not (see Repository.iocShadow.test.ts) and that is exactly why the
// self-cycle in getDependencies() went unnoticed.

const users = pgTable('inheritance_users', {
  id: uuid('id').primaryKey(),
  name: text('name'),
});

@Service('InheritanceDb')
class FakeDatabase {
  public rootConnection = { __label: 'pool' };
}

abstract class ReadOnlyRepositoryBase extends BaseRepository<typeof users> {
  public async fromBase(): Promise<string> {
    return 'base method';
  }

  public async overridden(): Promise<string> {
    return 'base wins';
  }

  public get baseGetter(): string {
    return 'base getter';
  }

  public static baseStatic(): string {
    return 'base static';
  }
}

abstract class AuditedRepositoryBase extends ReadOnlyRepositoryBase {
  public async fromMiddleBase(): Promise<string> {
    return 'middle method';
  }
}

@Repository({ table: users, databaseService: 'InheritanceDb', name: 'InheritingRepository' })
class InheritingRepository extends AuditedRepositoryBase {
  public async fromOwnPrototype(): Promise<string> {
    return 'own method';
  }

  public override async overridden(): Promise<string> {
    return 'subclass wins';
  }
}

// No explicit `name`, so the wrapper is registered under the class's own name. This is
// the default usage and it used to throw CircularDependencyError once the wrapper
// extended the target, because IocEngine counted the parent as a dependency of itself.
@Repository({ table: users, databaseService: 'InheritanceDb' })
class UnnamedRepository extends ReadOnlyRepositoryBase {}

const bootWith = async (components: any[]) => {
  const logger: any = { info: () => {}, warn: () => {}, error: () => {}, profile: () => {} };
  const server: any = await AsenaServerFactory.create({ logger, components, headless: true });

  await server.start();

  return server;
};

describe('@Repository inheritance', () => {
  test('keeps methods, getters and statics declared on a base class', async () => {
    const server = await bootWith([FakeDatabase, InheritingRepository]);
    const repo: any = await server.coreContainer.container.resolve('InheritingRepository');

    expect(await repo.fromBase()).toBe('base method');
    expect(await repo.fromMiddleBase()).toBe('middle method');
    expect(await repo.fromOwnPrototype()).toBe('own method');
    expect(repo.baseGetter).toBe('base getter');
    expect((InheritingRepository as any).baseStatic()).toBe('base static');
  });

  test('a subclass method overrides the inherited one', async () => {
    const server = await bootWith([FakeDatabase, InheritingRepository]);
    const repo: any = await server.coreContainer.container.resolve('InheritingRepository');

    expect(await repo.overridden()).toBe('subclass wins');
  });

  test('keeps the BaseRepository CRUD surface and the injected connection', async () => {
    const server = await bootWith([FakeDatabase, InheritingRepository]);
    const repo: any = await server.coreContainer.container.resolve('InheritingRepository');

    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.paginate).toBe('function');
    expect(repo._db).toEqual({ __label: 'pool' });
    expect(repo.table).toBe(users);
  });

  test('resolves when no explicit name is given (self-cycle regression)', async () => {
    const server = await bootWith([FakeDatabase, UnnamedRepository]);
    const repo: any = await server.coreContainer.container.resolve('UnnamedRepository');

    expect(repo).toBeDefined();
    expect(await repo.fromBase()).toBe('base method');
  });

  test('instances stay instanceof their declared base classes', () => {
    const repo: any = new (InheritingRepository as any)();

    expect(repo instanceof AuditedRepositoryBase).toBe(true);
    expect(repo instanceof ReadOnlyRepositoryBase).toBe(true);
    expect(repo instanceof BaseRepository).toBe(true);
  });
});

abstract class LoggingDatabaseBase extends AsenaDatabaseService {
  public describe(): string {
    return 'from the database base class';
  }
}

@Database({
  type: 'bun-sql',
  // DatabaseConfig requires host/port/database/user/password; nothing connects here, this
  // is a metadata-only probe.
  config: { host: 'localhost', port: 5432, database: 'inheritance_probe', user: 'probe', password: 'probe' },
  name: 'InheritingDatabase',
})
class InheritingDatabase extends LoggingDatabaseBase {
  public describeOwn(): string {
    return 'from the decorated class';
  }
}

describe('@Database inheritance', () => {
  // Booting this one would open a real connection in @OnStart, so the contract is
  // asserted on the returned class instead.
  test('keeps methods declared on a base class', () => {
    const instance: any = new (InheritingDatabase as any)();

    expect(instance.describe()).toBe('from the database base class');
    expect(instance.describeOwn()).toBe('from the decorated class');
  });

  test('keeps the AsenaDatabaseService surface', () => {
    const instance: any = new (InheritingDatabase as any)();

    expect(typeof instance.testConnection).toBe('function');
    expect(typeof instance.disconnect).toBe('function');
    expect(instance instanceof LoggingDatabaseBase).toBe(true);
  });
});
