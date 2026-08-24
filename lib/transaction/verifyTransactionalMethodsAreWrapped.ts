import type { Container } from '@asenajs/asena/container';
import { collectTransactionalMethods } from './transactionMetadata';

/**
 * Fails the boot when any `@Transaction` method reached the container unwrapped.
 *
 * `TransactionPostProcessor.postProcess` installs each wrapper as an **own** property on the
 * instance, so a method still sitting on the prototype was never wrapped: either no
 * `TransactionPostProcessor` subclass is registered at all, or the class was constructed
 * inside a post-processor's dependency closure (Phase A), before post-processing was active.
 * Either way every call would run with autocommit - writes land, tests pass, nothing is
 * transactional - which is why this throws instead of warning.
 *
 * Transient entries (`instance: null`) are skipped: the container constructs a fresh instance
 * per resolve and post-processes each one as it is built, so there is no single instance whose
 * own properties could be checked ahead of time.
 *
 * @param container - The container whose registered services are inspected
 * @throws {Error} Naming every unwrapped `<Class>.<method>` when at least one is found
 */
export function verifyTransactionalMethodsAreWrapped(container: Container): void {
  const unwrapped: string[] = [];
  const services = container.services ?? {};

  for (const registry of Object.values(services)) {
    const entries = Array.isArray(registry) ? registry : [registry];

    for (const entry of entries) {
      if (!entry?.singleton || !entry.instance) continue;

      for (const methodName of collectTransactionalMethods(entry.Class).keys()) {
        if (!Object.hasOwn(entry.instance, methodName)) {
          unwrapped.push(`${entry.Class.name}.${methodName}`);
        }
      }
    }
  }

  if (unwrapped.length > 0) {
    throw new Error(
      `@Transaction methods are not wrapped: ${unwrapped.join(', ')} - they would run with autocommit. ` +
        `Register a TransactionPostProcessor subclass in your source folder ` +
        `(@Drizzle({ defaultDb: '...' }) export class AppDrizzle extends TransactionPostProcessor {}) ` +
        `and keep transactional classes out of a post-processor's dependency closure.`,
    );
  }
}
