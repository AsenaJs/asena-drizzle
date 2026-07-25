import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { Transaction } from '../lib/decorators/Transaction';
import { Drizzle } from '../lib/decorators/Drizzle';
import { TransactionContext, getActiveTx } from '../lib/transaction/TransactionContext';
import { TransactionPostProcessor } from '../lib/transaction/TransactionPostProcessor';
import { AsenaDatabaseService } from '../lib/DatabaseService';

/**
 * Minimal drizzle-ish transaction stub: captures every `transaction()` call it
 * receives (including nested ones) and exposes them so the tests can assert on
 * propagation semantics without needing a real database connection.
 *
 * Each call returns a brand-new tx handle — a `txId` + a bound `transaction()`
 * member that recursively creates savepoints.
 */
function createTxStub() {
  const calls: Array<{ txId: number; parentId: number | null; config?: any }> = [];

  let nextId = 1;

  const build = (parentId: number | null): any => {
    const txId = nextId++;
    const node = {
      txId,
      async transaction(cb: (tx: any) => Promise<unknown>, config?: any) {
        calls.push({ txId: nextId, parentId: txId, config });
        const savepoint = build(txId);

        return cb(savepoint);
      },
    };

    return node;
  };

  const root = {
    async transaction(cb: (tx: any) => Promise<unknown>, config?: any) {
      calls.push({ txId: nextId, parentId: null, config });
      const tx = build(null);

      return cb(tx);
    },
  };

  return { root, calls };
}

function buildDatabaseServiceStub(connection: any) {
  // We stand up a real subclass instance so `instanceof AsenaDatabaseService`
  // inside the post-processor resolves correctly.
  class StubDb extends AsenaDatabaseService<any> {}

  const instance = new StubDb();

  // Access the protected adapter slot via a typed cast to expose the mock
  // connection through the base class `connection` getter.
  (instance as unknown as { adapter: { connection: any } }).adapter = { connection } as any;

  return instance;
}

function buildContainerStub(name: string, dbService: AsenaDatabaseService<any>) {
  return {
    services: {
      [name]: { Class: (dbService as any).constructor, instance: dbService, singleton: true },
    },
  } as unknown as import('@asenajs/asena/container').Container;
}

async function wrapService<T extends object>(
  instance: T,
  container: ReturnType<typeof buildContainerStub>,
  ProcessorClass: new () => TransactionPostProcessor = TransactionPostProcessor,
): Promise<T> {
  const processor = new ProcessorClass();

  (processor as unknown as { container: any }).container = container;

  return processor.postProcess(instance, instance.constructor);
}

describe('@Transaction decorator', () => {
  let dbStub: ReturnType<typeof createTxStub>;
  let dbService: AsenaDatabaseService<any>;
  let container: ReturnType<typeof buildContainerStub>;

  beforeEach(() => {
    dbStub = createTxStub();
    dbService = buildDatabaseServiceStub(dbStub.root);
    container = buildContainerStub('MyDb', dbService);
  });

  it('REQUIRED: nested calls join the outer transaction (no new tx opened)', async () => {
    class Service {
      @Transaction({ database: 'MyDb' })
      async outer() {
        // The inner call is on the *same wrapped instance*, so the wrapped
        // inner method runs — proving that joining an existing tx does not
        // open a new one.
        return this.inner();
      }

      @Transaction({ database: 'MyDb' })
      async inner() {
        return getActiveTx('MyDb');
      }
    }

    const svc = await wrapService(new Service(), container);

    await svc.outer();

    // Exactly one top-level transaction should have been opened.
    expect(dbStub.calls.length).toBe(1);
    expect(dbStub.calls[0]?.parentId).toBeNull();
  });

  it('NESTED: inner call opens a savepoint on the active transaction', async () => {
    class Service {
      @Transaction({ database: 'MyDb' })
      async outer() {
        return this.inner();
      }

      @Transaction({ database: 'MyDb', propagation: 'NESTED' })
      async inner() {
        return getActiveTx('MyDb');
      }
    }

    const svc = await wrapService(new Service(), container);

    await svc.outer();

    // Two calls: one top-level, one savepoint (parent = top-level tx).
    expect(dbStub.calls.length).toBe(2);
    expect(dbStub.calls[0]?.parentId).toBeNull();
    expect(dbStub.calls[1]?.parentId).not.toBeNull();
  });

  it('REQUIRES_NEW: inner call opens an independent top-level transaction', async () => {
    class Service {
      @Transaction({ database: 'MyDb' })
      async outer() {
        return this.inner();
      }

      @Transaction({ database: 'MyDb', propagation: 'REQUIRES_NEW' })
      async inner() {
        return getActiveTx('MyDb');
      }
    }

    const svc = await wrapService(new Service(), container);

    await svc.outer();

    // Two *top-level* transactions — neither has a parent.
    expect(dbStub.calls.length).toBe(2);
    expect(dbStub.calls[0]?.parentId).toBeNull();
    expect(dbStub.calls[1]?.parentId).toBeNull();
  });

  it('forwards isolationLevel / accessMode to the drizzle transaction config', async () => {
    class Service {
      @Transaction({
        database: 'MyDb',
        isolationLevel: 'serializable',
        accessMode: 'read only',
      })
      async run() {
        return 'ok';
      }
    }

    const svc = await wrapService(new Service(), container);

    await svc.run();

    expect(dbStub.calls[0]?.config).toEqual({ isolationLevel: 'serializable', accessMode: 'read only' });
  });

  it('rolls back the transaction when the method throws', async () => {
    let capturedInTx: unknown | undefined;

    class Service {
      @Transaction({ database: 'MyDb' })
      async explode() {
        capturedInTx = getActiveTx('MyDb');
        throw new Error('boom');
      }
    }

    const svc = await wrapService(new Service(), container);

    await expect(svc.explode()).rejects.toThrow('boom');

    // ALS exposed the tx during the call…
    expect(capturedInTx).toBeDefined();
    // …and after the throw we are back outside any transactional scope.
    expect(TransactionContext.getStore()).toBeUndefined();
  });

  it('fails fast at registration time when database is missing and no defaultDb is configured', async () => {
    class Service {
      @Transaction()
      async run() {
        return 'ok';
      }
    }

    await expect(wrapService(new Service(), container)).rejects.toThrow(/could not resolve a database/);
  });

  it('fails fast when the named database service is not registered', async () => {
    class Service {
      @Transaction({ database: 'Missing' })
      async run() {
        return 'ok';
      }
    }

    const svc = new Service();
    const processor = new TransactionPostProcessor();

    (processor as unknown as { container: any }).container = container;

    await processor.postProcess(svc, Service);

    await expect(svc.run()).rejects.toThrow(/no component named 'Missing' is registered/);
  });

  describe('@Drizzle({ defaultDb })', () => {
    // Subclass mirrors what a user would put in `src/config/AppDrizzle.ts`.
    // The decorator chains @PostProcessor() onto the subclass and writes
    // DRIZZLE_OPTIONS_KEY metadata that TransactionPostProcessor reads via
    // `this.constructor`.
    @Drizzle({ defaultDb: 'MyDb' })
    class AppDrizzle extends TransactionPostProcessor {}

    it('falls back to defaultDb when @Transaction omits the database option', async () => {
      class Service {
        @Transaction()
        async run() {
          return getActiveTx('MyDb');
        }
      }

      const svc = await wrapService(new Service(), container, AppDrizzle);
      const seenTx = await svc.run();

      // A transaction was opened on the configured default db, and the call
      // saw it through ALS.
      expect(dbStub.calls.length).toBe(1);
      expect(seenTx).toBeDefined();
    });

    it('explicit @Transaction({ database }) wins over defaultDb', async () => {
      // Register a second database service so we can prove the explicit name
      // is honored — not silently replaced by defaultDb.
      const otherDbStub = createTxStub();
      const otherDbService = buildDatabaseServiceStub(otherDbStub.root);
      const multiContainer = {
        services: {
          MyDb: { Class: (dbService as any).constructor, instance: dbService, singleton: true },
          OtherDb: { Class: (otherDbService as any).constructor, instance: otherDbService, singleton: true },
        },
      } as unknown as import('@asenajs/asena/container').Container;

      class Service {
        @Transaction({ database: 'OtherDb' })
        async run() {
          return 'ok';
        }
      }

      await wrapService(new Service(), multiContainer, AppDrizzle).then((svc) => svc.run());

      // The transaction must have been opened on OtherDb, not MyDb.
      expect(otherDbStub.calls.length).toBe(1);
      expect(dbStub.calls.length).toBe(0);
    });
  });
});
