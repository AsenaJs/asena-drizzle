import 'reflect-metadata';
import { getOwnMetadata } from 'reflect-metadata/no-conflict';
import { getPrototypeChainOf } from '@asenajs/asena/utils';
import { TRANSACTION_METADATA_KEY, type TransactionOptions } from './TransactionOptions';

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
export function collectTransactionalMethods(Class: any): Map<string, TransactionOptions> {
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
