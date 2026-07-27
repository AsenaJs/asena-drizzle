import 'reflect-metadata';
import { getOwnMetadata } from 'reflect-metadata/no-conflict';
import { Inject } from '@asenajs/asena/decorators/ioc';
import type { ComponentPostProcessor } from '@asenajs/asena/ioc/types';
import { ICoreServiceNames } from '@asenajs/asena/ioc/types';
import type { Container } from '@asenajs/asena/container';
import { getOwnTypedMetadata, getPrototypeChainOf } from '@asenajs/asena/utils';
import { AsenaDatabaseService } from '../DatabaseService';
import { TRANSACTION_METADATA_KEY, type TransactionOptions } from './TransactionOptions';
import { DRIZZLE_OPTIONS_KEY, type DrizzleOptions } from './DrizzleOptions';
import { executeTransactional } from './executeTransactional';

/**
 * The shape we need from a resolved `AsenaDatabaseService` — exposed as
 * `connection` by the base class. Kept structural so callers are not forced
 * to import the concrete drizzle dialect types.
 */
interface TransactableConnectionHolder {
  connection: {
    transaction<R>(callback: (tx: unknown) => Promise<R>, config?: Record<string, unknown>): Promise<R>;
  };
}

/**
 * Scans every user component for `@Transaction`-annotated methods and wraps
 * them so each call executes inside a Drizzle transaction with the configured
 * propagation and isolation.
 *
 * This base class **does not** carry a `@PostProcessor()` decorator on its
 * own — AsenaJS only scans user-side source folders, not `node_modules`. To
 * activate it, users subclass it inside their project and apply
 * `@DrizzleConfig({ ... })`, which chains the post-processor decorator onto
 * the subclass:
 *
 * ```typescript
 * // src/config/AppDrizzle.ts
 * @DrizzleConfig({ defaultDb: 'MainDatabase' })
 * export class AppDrizzle extends TransactionPostProcessor {}
 * ```
 */
export class TransactionPostProcessor implements ComponentPostProcessor {
  @Inject(ICoreServiceNames.CONTAINER)
  private container!: Container;

  // Caches the resolved root drizzle instance per database service name so a
  // hot transactional path does not repeatedly walk the container map.
  private readonly rootDbCache = new Map<string, TransactableConnectionHolder['connection']>();

  /**
   * Merges every `@Transaction` map on the prototype chain, ancestors first.
   *
   * `@Transaction` writes to the class that declares the method, so a shared base class holds
   * its own map. Reading own-only meant a base class's transactional methods ran with
   * autocommit - silently, since the method still returned normally and each write committed
   * on its own. Reading the nearest ancestor instead (`getMetadata`) was worse than it looks:
   * it worked right up until the concrete class declared a `@Transaction` of its own, at which
   * point the base's map was shadowed and its methods quietly left the transaction.
   */
  private collectTransactionalMethods(Class: any): Map<string, TransactionOptions> {
    const merged = new Map<string, TransactionOptions>();

    for (const link of getPrototypeChainOf(Class)) {
      const own = getOwnMetadata(TRANSACTION_METADATA_KEY, link) as Map<string, TransactionOptions> | undefined;

      if (!own) continue;

      for (const [methodName, options] of own.entries()) {
        merged.set(methodName, options);
      }
    }

    return merged;
  }

  public async postProcess<T>(instance: T, Class: any): Promise<T> {
    const metadata = this.collectTransactionalMethods(Class);

    if (metadata.size === 0) {
      return instance;
    }

    const container = this.container;
    const rootDbCache = this.rootDbCache;
    const resolveRootDb = (databaseName: string) => this.resolveRootDb(container, rootDbCache, databaseName, Class);
    const defaultDb = this.getConfiguredDefaultDb();

    for (const [methodName, rawOptions] of metadata.entries()) {
      // Resolve the database name with the following precedence:
      //   1. explicit `@Transaction({ database: 'X' })` option
      //   2. `defaultDb` from the user's @DrizzleConfig
      //   3. fail fast at registration time
      const resolvedDatabase = rawOptions.database ?? defaultDb;

      if (!resolvedDatabase) {
        throw new Error(
          `@Transaction on ${Class.name}.${methodName} could not resolve a database. ` +
            `Either pass 'database' to @Transaction, or set 'defaultDb' on your @DrizzleConfig class.`,
        );
      }

      const options: TransactionOptions = { propagation: 'REQUIRED', ...rawOptions, database: resolvedDatabase };

      const original = (instance as Record<string, unknown>)[methodName];

      if (typeof original !== 'function') {
        throw new Error(
          `@Transaction on ${Class.name}.${methodName} could not find a method with that name on the instance. ` +
            `Use @Transaction on async class methods (arrow-function properties are not supported).`,
        );
      }

      const databaseName = resolvedDatabase;

      (instance as Record<string, unknown>)[methodName] = async function wrapped(this: unknown, ...args: unknown[]) {
        return executeTransactional({
          databaseName,
          options,
          resolveRootDb: () => resolveRootDb(databaseName),
          body: () => (original as (...a: unknown[]) => Promise<unknown>).apply(this, args),
        });
      };
    }

    return instance;
  }

  /**
   * Reads the @DrizzleConfig options that were attached to the user-side
   * subclass. Falls back to an empty object so behavior is identical to a
   * subclass that did not configure anything.
   */
  private getConfiguredDefaultDb(): string | undefined {
    const options = getOwnTypedMetadata<DrizzleOptions>(DRIZZLE_OPTIONS_KEY, this.constructor);

    return options?.defaultDb;
  }

  private resolveRootDb(
    container: Container,
    cache: Map<string, TransactableConnectionHolder['connection']>,
    databaseName: string,
    Class: { name: string },
  ): TransactableConnectionHolder['connection'] {
    const cached = cache.get(databaseName);

    if (cached) return cached;

    const service = this.resolveDatabaseService(container, databaseName, Class);
    const connection = service.connection as TransactableConnectionHolder['connection'];

    cache.set(databaseName, connection);

    return connection;
  }

  private resolveDatabaseService(
    container: Container,
    databaseName: string,
    Class: { name: string },
  ): AsenaDatabaseService<unknown> {
    const registry = container.services?.[databaseName];

    if (!registry) {
      throw new Error(
        `@Transaction on ${Class.name}: no component named '${databaseName}' is registered. ` +
          `Make sure a @Database service with name '${databaseName}' is exported and picked up by component scanning.`,
      );
    }

    const entry = Array.isArray(registry) ? registry[0] : registry;
    const instance = entry?.instance;

    if (!(instance instanceof AsenaDatabaseService)) {
      throw new Error(
        `@Transaction on ${Class.name}: component '${databaseName}' is not an AsenaDatabaseService instance. ` +
          `Ensure the target is a @Database-decorated service.`,
      );
    }

    return instance;
  }
}
