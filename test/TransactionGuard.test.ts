import { describe, expect, it } from 'bun:test';
import { AsenaServerFactory } from '@asenajs/asena';
import { Service } from '@asenajs/asena/decorators';
import { Inject } from '@asenajs/asena/decorators/ioc';
import { Database } from '../lib/decorators/Database';
import { Drizzle } from '../lib/decorators/Drizzle';
import { Transaction } from '../lib/decorators/Transaction';
import { TransactionPostProcessor } from '../lib/transaction/TransactionPostProcessor';
import { AsenaDatabaseService } from '../lib/DatabaseService';

// Without a TransactionPostProcessor subclass in src/, every @Transaction method runs with
// autocommit and nothing says so. The boot guard turns that silent failure into a failed
// boot; this suite pins down when it throws, when it must not, and that it runs once.

const silentLogger: any = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, profile: () => {} };

const fakeAdapter = () => ({
  connect: async () => ({}),
  disconnect: async () => {},
  testConnection: async () => true,
  connection: {
    __label: 'pool',
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({ __label: 'tx' }),
  },
});

// Flattens an error and its cause chain into one string: the container wraps a failing
// @OnStart hook, so the guard's message lands on `cause`, not on the top-level message.
const causeChain = (error: unknown): string => {
  const messages: string[] = [];
  let current: any = error;

  while (current) {
    if (current.message) messages.push(current.message);
    current = current.cause;
  }

  return messages.join(' | ');
};

const startError = async (server: any): Promise<unknown> =>
  server.start().then(
    () => null,
    (err: unknown) => err,
  );

@Database({ type: 'bun-sql', config: { database: 'guard' }, name: 'GuardDb' })
class GuardDb extends AsenaDatabaseService<any> {}

// onStart would dial out for real otherwise; these tests are about wrapping, not connecting.
// Patching the wrapper's own prototype shadows the base createAdapter for every instance.
(GuardDb as any).prototype.createAdapter = () => fakeAdapter();

const bootWith = async (components: any[]) => {
  const server: any = await AsenaServerFactory.create({ logger: silentLogger, components, headless: true });

  return server;
};

describe('@Transaction boot guard', () => {
  it('aborts the boot when no TransactionPostProcessor is registered', async () => {
    @Service('GuardUserService')
    class GuardUserService {
      @Transaction({ database: 'GuardDb' })
      async register(): Promise<string> {
        return 'registered';
      }
    }

    const server = await bootWith([GuardDb, GuardUserService]);
    const error = await startError(server);

    expect(error).toBeTruthy();
    expect(causeChain(error)).toContain('@Transaction methods are not wrapped: GuardUserService.register');
    expect(causeChain(error)).toContain('they would run with autocommit');
  });

  it('boots green and the method is wrapped when a TransactionPostProcessor is registered', async () => {
    @Service('WrappedUserService')
    class WrappedUserService {
      @Transaction({ database: 'GuardDb' })
      async register(): Promise<string> {
        return 'registered';
      }
    }

    @Drizzle({ defaultDb: 'GuardDb' })
    class GuardDrizzle extends TransactionPostProcessor {}

    const server = await bootWith([GuardDb, WrappedUserService, GuardDrizzle]);

    await server.start();

    const instance: any = await server.coreContainer.container.resolve('WrappedUserService');

    // postProcess installs the wrapper as an own property - that is what the guard checks.
    expect(Object.hasOwn(instance, 'register')).toBe(true);
    expect(await instance.register()).toBe('registered');

    await server.stop();
  });

  it('does not throw when no @Transaction is used anywhere', async () => {
    @Service('PlainService')
    class PlainService {
      async ping(): Promise<string> {
        return 'pong';
      }
    }

    const server = await bootWith([GuardDb, PlainService]);

    await server.start();

    const instance: any = await server.coreContainer.container.resolve('PlainService');

    expect(await instance.ping()).toBe('pong');

    await server.stop();
  });

  it('runs the check once per container even with two @Database services', async () => {
    // The guard walks every registered service; with two databases it must still execute a
    // single walk per container. Observable through a services getter that counts reads.
    class CountingContainer {
      public reads = 0;
      public readonly lifecycle: Array<{ instance: unknown }>;
      private readonly entries: Record<string, unknown>;

      constructor(entries: Record<string, unknown>, lifecycle: Array<{ instance: unknown }>) {
        this.entries = entries;
        this.lifecycle = lifecycle;
      }

      get services(): Record<string, unknown> {
        this.reads++;

        return this.entries;
      }
    }

    class ProbeDatabase extends AsenaDatabaseService<any> {
      public async callOnStart(): Promise<void> {
        await this.onStart();
      }
    }

    (ProbeDatabase as any).prototype.createAdapter = () => fakeAdapter();

    const first = new ProbeDatabase();
    const second = new ProbeDatabase();
    const container = new CountingContainer(
      {
        FirstDb: { Class: ProbeDatabase, instance: first, singleton: true },
        SecondDb: { Class: ProbeDatabase, instance: second, singleton: true },
      },
      [{ instance: first }, { instance: second }],
    );

    for (const probe of [first, second]) {
      (probe as any).container = container;
      (probe as any).setDatabaseOptions({
        type: 'bun-sql',
        config: { database: 'probe' },
        logger: silentLogger,
      });
    }

    await first.callOnStart();
    await second.callOnStart();

    expect(container.reads).toBe(1);
  });

  it('aborts the boot for a transactional class inside a post-processor dependency closure (Phase A)', async () => {
    // The engine builds a post-processor's dependencies before post-processing is active, so
    // PhaseAWriter never gets wrapped - even though the post-processor IS registered.
    @Service('PhaseAWriter')
    class PhaseAWriter {
      @Transaction({ database: 'GuardDb' })
      async write(): Promise<string> {
        return 'written';
      }
    }

    @Drizzle({ defaultDb: 'GuardDb' })
    class EarlyDrizzle extends TransactionPostProcessor {
      @Inject('PhaseAWriter')
      private writer!: PhaseAWriter;
    }

    const server = await bootWith([GuardDb, PhaseAWriter, EarlyDrizzle]);
    const error = await startError(server);

    expect(error).toBeTruthy();
    expect(causeChain(error)).toContain('@Transaction methods are not wrapped: PhaseAWriter.write');
  });
});
