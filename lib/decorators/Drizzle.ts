import { PostProcessor } from '@asenajs/asena/decorators';
import { defineTypedMetadata } from '@asenajs/asena/utils';
import { DRIZZLE_OPTIONS_KEY, type DrizzleOptions } from '../transaction/DrizzleOptions';

/**
 * Configures the asena-drizzle transaction post-processor for an Asena
 * application.
 *
 * Apply this to a class extending `TransactionPostProcessor` placed inside the
 * project's source folder (typically `src/config/`). The decorator chains
 * `@PostProcessor()` onto the user-side subclass so AsenaJS picks it up via
 * normal component scanning — `node_modules` are never scanned, so this is
 * the supported way to activate the post-processor.
 *
 * @example
 * ```typescript
 * // src/config/AppDrizzle.ts
 * import { Drizzle, TransactionPostProcessor } from '@asenajs/asena-drizzle';
 *
 * @Drizzle({ defaultDb: 'MainDatabase' })
 * export class AppDrizzle extends TransactionPostProcessor {}
 * ```
 *
 * The decorator is intentionally minimal: only `defaultDb` is supported in
 * v1.2.0 so that single-database projects can omit `database` on every
 * `@Transaction` call site. More options can be added later without
 * breaking existing usage.
 */
export function Drizzle(options: DrizzleOptions = {}) {
  return function <T extends new (...args: any[]) => any>(target: T): T {
    defineTypedMetadata(DRIZZLE_OPTIONS_KEY, options, target);

    // Chain @PostProcessor() so AsenaJS auto-registers the user-side subclass.
    return PostProcessor()(target) as unknown as T;
  };
}

export type { DrizzleOptions } from '../transaction/DrizzleOptions';
