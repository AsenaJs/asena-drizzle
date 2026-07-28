import 'reflect-metadata';
import type { DatabaseOptions } from '../types';
import { AsenaDatabaseService } from '../DatabaseService';
import { Service } from '@asenajs/asena/decorators';

/**
 * Options for the @Database decorator
 *
 * @interface DatabaseDecoratorOptions
 * @extends {DatabaseOptions}
 *
 * @property {string} [name] - Optional service name for the database connection.
 *                             Useful when you need multiple database connections.
 *                             If not provided, the class name will be used.
 */
export interface DatabaseDecoratorOptions extends DatabaseOptions {
  name?: string;
}

/**
 * Database decorator for creating database service instances with Drizzle ORM integration.
 *
 * This decorator simplifies database connection management by:
 * - Automatically connecting to the database on service initialization
 * - Providing a Drizzle ORM instance for type-safe queries
 * - Supporting multiple database types (PostgreSQL, MySQL, BunSQL)
 * - Integrating with AsenaJS IoC container
 *
 * @param {DatabaseDecoratorOptions} options - Database configuration options
 *
 * @example
 * ```typescript
 * // Single database connection
 * @Database({
 *   type: 'postgresql',
 *   config: {
 *     host: 'localhost',
 *     port: 5432,
 *     database: 'myapp',
 *     user: 'postgres',
 *     password: 'password',
 *   }
 * })
 * export class MyDatabase extends AsenaDatabaseService {}
 * ```
 *
 * @example
 * ```typescript
 * // Multiple database connections with custom names
 * @Database({
 *   type: 'postgresql',
 *   config: { host: 'localhost', database: 'users_db', ... },
 *   name: 'UsersDB'
 * })
 * export class UsersDatabase extends AsenaDatabaseService {}
 *
 * @Database({
 *   type: 'mysql',
 *   config: { host: 'localhost', database: 'products_db', ... },
 *   name: 'ProductsDB'
 * })
 * export class ProductsDatabase extends AsenaDatabaseService {}
 * ```
 *
 * @example
 * ```typescript
 * // With Drizzle configuration
 * @Database({
 *   type: 'bun-sql',
 *   config: {
 *     host: 'localhost',
 *     database: 'myapp',
 *   },
 *   drizzleConfig: {
 *     logger: true, // Enable SQL query logging
 *     schema: mySchema, // Your Drizzle schema
 *   }
 * })
 * export class MyDatabase extends AsenaDatabaseService {}
 * ```
 *
 * @returns {ClassDecorator} Class decorator function
 */
export function Database(options: DatabaseDecoratorOptions) {
  return function <T extends new (...args: any[]) => AsenaDatabaseService>(target: T) {
    // Extend the decorated class itself. Extending AsenaDatabaseService discarded the
    // target's prototype chain, so anything the service inherited from an intermediate
    // base class was silently dropped.
    //
    // This used to self-cycle in the container: the wrapper is registered under the
    // target's own name, and IocEngine treated the parent name as a dependency. That is
    // fixed in @asenajs/asena, which now skips a parent resolving to the component's own
    // name - hence the peer bump.
    @Service(options.name || target.name)
    class DatabaseServiceClass extends (target as unknown as typeof AsenaDatabaseService) {
      public constructor() {
        // Call super without parameters for AsenaJS property injection
        super();

        // Set options via property injection method
        if (!options.logger) {
          options.logger = console;
        }

        this.setDatabaseOptions(options);
      }
    }

    // No member or metadata copying - the wrapper `extends target`, so everything on the target
    // and its own ancestors is reachable through the prototype chain, and every reader walks it.
    //
    // The metadata loop in particular was destructive: `getMetadataKeys` walks the chain while
    // `getMetadata` returns only the nearest value, so it flattened inherited records onto the
    // wrapper as own properties. A @Database extending another @Database therefore inherited its
    // parent's NameKey and registered under the parent's name - the container promoted the entry
    // to an array and transactions silently committed against the wrong database.

    // Fix: Override the class name to match the original target class
    // This ensures the exported class name matches what CLI expects during build
    Object.defineProperty(DatabaseServiceClass, 'name', {
      value: target.name,
      writable: false,
      configurable: true,
    });

    return DatabaseServiceClass as any;
  };
}
