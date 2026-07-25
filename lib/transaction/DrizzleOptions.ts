/**
 * Library-wide configuration declared via the `@Drizzle` decorator. Read by
 * {@link TransactionPostProcessor} at bootstrap to fill in defaults that
 * would otherwise have to be repeated on every `@Transaction` site.
 */
export interface DrizzleOptions {
  /**
   * Name of the @Database service to use when a `@Transaction` does not set
   * its own `database` option. Lets users with a single database avoid
   * repeating the service name across every `@Transaction` boundary.
   */
  defaultDb?: string;
}

/**
 * Metadata key used by the `@Drizzle` decorator to attach the configured
 * options to the user-side post-processor class.
 */
export const DRIZZLE_OPTIONS_KEY = Symbol.for('asena:drizzle:config:options');
