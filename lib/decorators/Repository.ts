import 'reflect-metadata';
import { Service } from '@asenajs/asena/server';
import { Inject } from '@asenajs/asena/ioc';
import { BaseRepository, type TableWithId } from '../Repository';
import { defineMetadata, getMetadata, getMetadataKeys } from 'reflect-metadata/no-conflict';

/**
 * Options for the @Repository decorator
 *
 * @interface RepositoryDecoratorOptions
 *
 * @property {TableWithId} table - Drizzle table schema definition. Must have an 'id' column.
 * @property {string} databaseService - Name of the database service to inject the connection from.
 *                                      This should match the name of your @Database service.
 * @property {string} [name] - Optional service name for the repository.
 *                             If not provided, the class name will be used.
 */
export interface RepositoryDecoratorOptions {
  table: TableWithId;
  databaseService: string;
  name?: string;
}

/**
 * Repository decorator for creating type-safe database repositories with Drizzle ORM.
 *
 * This decorator provides:
 * - Automatic database connection injection from a @Database service
 * - Built-in CRUD operations (create, read, update, delete)
 * - Type-safe queries with full TypeScript support
 * - Pagination, filtering, and counting utilities
 * - Integration with AsenaJS IoC container
 *
 * The repository automatically inherits common database operations from BaseRepository,
 * and you can add custom methods specific to your domain.
 *
 * @param {RepositoryDecoratorOptions} options - Repository configuration options
 *
 * @example
 * ```typescript
 * // Define your Drizzle schema
 * const users = pgTable('users', {
 *   id: uuid('id').primaryKey().defaultRandom(),
 *   name: text('name').notNull(),
 *   email: text('email').notNull().unique(),
 *   createdAt: timestamp('created_at').defaultNow(),
 * });
 *
 * // Create a repository with custom methods
 * @Repository({
 *   table: users,
 *   databaseService: 'MyDatabase', // Must match your @Database service name
 *   name: 'UserRepository' // Optional
 * })
 * export class UserRepository extends BaseRepository<typeof users> {
 *   // Custom method - find user by email
 *   async findByEmail(email: string) {
 *     return this.findOne(eq(users.email, email));
 *   }
 *
 *   // Custom method - find active users
 *   async findActiveUsers() {
 *     return this.db
 *       .select()
 *       .from(this.table)
 *       .where(eq(users.active, true));
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Using the repository (injected by AsenaJS)
 * class UserService {
 *   constructor(private userRepo: UserRepository) {}
 *
 *   async createUser(data: { name: string; email: string }) {
 *     // Built-in create method
 *     return await this.userRepo.create(data);
 *   }
 *
 *   async getUserById(id: string) {
 *     // Built-in findById method
 *     return await this.userRepo.findById(id);
 *   }
 *
 *   async getUserByEmail(email: string) {
 *     // Custom method
 *     return await this.userRepo.findByEmail(email);
 *   }
 *
 *   async getAllUsers(page: number = 1) {
 *     // Built-in pagination
 *     return await this.userRepo.paginate(page, 10);
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Multiple repositories with the same database
 * @Repository({
 *   table: users,
 *   databaseService: 'MyDatabase'
 * })
 * export class UserRepository extends BaseRepository<typeof users> {}
 *
 * @Repository({
 *   table: posts,
 *   databaseService: 'MyDatabase'
 * })
 * export class PostRepository extends BaseRepository<typeof posts> {}
 * ```
 *
 * @returns {ClassDecorator} Class decorator function
 */
export function Repository(options: RepositoryDecoratorOptions) {
  return function <T extends new () => BaseRepository<any>>(target: T): T {
    // Create a new class that extends BaseRepository directly instead of target
    // This prevents the original repository class from being added to the dependency chain
    @Service(options.name || target.name)
    class RepositoryServiceClass extends BaseRepository<any> {
      public constructor() {
        super();
        this.table = options.table; // Set the table schema
      }
    }

    // Add database injection via decorator to the wrapper class
    const databaseServiceName = options.databaseService;

    Inject(databaseServiceName, (service: any) => service.connection)(RepositoryServiceClass.prototype, 'db');

    // Copy only the custom methods from target prototype (user's repository methods)
    Object.getOwnPropertyNames(target.prototype).forEach((name) => {
      if (name !== 'constructor') {
        const descriptor = Object.getOwnPropertyDescriptor(target.prototype, name);

        if (descriptor) {
          Object.defineProperty(RepositoryServiceClass.prototype, name, descriptor);
        }
      }
    });

    // Copy static methods and properties from target
    Object.getOwnPropertyNames(target).forEach((name) => {
      if (name !== 'prototype' && name !== 'name' && name !== 'length') {
        const descriptor = Object.getOwnPropertyDescriptor(target, name);

        if (descriptor) {
          Object.defineProperty(RepositoryServiceClass, name, descriptor);
        }
      }
    });

    // Copy metadata from target
    const metadata = getMetadataKeys(target);

    metadata.forEach((key) => {
      const value = getMetadata(key, target);

      defineMetadata(key, value, RepositoryServiceClass);
    });

    // Fix: Override the class name to match the original target class
    // This ensures the exported class name matches what CLI expects during build
    Object.defineProperty(RepositoryServiceClass, 'name', {
      value: target.name,
      writable: false,
      configurable: true,
    });

    return RepositoryServiceClass as any;
  };
}
