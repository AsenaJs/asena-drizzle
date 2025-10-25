import 'reflect-metadata';
import type { DatabaseOptions } from '../types';
import { AsenaDatabaseService } from '../DatabaseService';
import { Service } from '@asenajs/asena/server';
import { defineMetadata, getMetadata, getMetadataKeys } from 'reflect-metadata/no-conflict';

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
  return function <T extends new (...args: any[]) => any>(target: T) {
    // Create a new class that extends AsenaDatabaseService directly
    // without trying to extend the target class (which causes circular dependency)
    @Service(options.name || target.name)
    class DatabaseServiceClass extends AsenaDatabaseService {
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

    // Copy only the methods from target prototype, not the constructor
    Object.getOwnPropertyNames(target.prototype).forEach((name) => {
      if (name !== 'constructor') {
        const descriptor = Object.getOwnPropertyDescriptor(target.prototype, name);

        if (descriptor) {
          Object.defineProperty(DatabaseServiceClass.prototype, name, descriptor);
        }
      }
    });

    // Copy static methods and properties
    Object.getOwnPropertyNames(target).forEach((name) => {
      if (name !== 'prototype' && name !== 'name' && name !== 'length') {
        const descriptor = Object.getOwnPropertyDescriptor(target, name);

        if (descriptor) {
          Object.defineProperty(DatabaseServiceClass, name, descriptor);
        }
      }
    });

    // Copy metadata
    const metadata = getMetadataKeys(target);

    metadata.forEach((key) => {
      const value = getMetadata(key, target);

      defineMetadata(key, value, DatabaseServiceClass);
    });

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
