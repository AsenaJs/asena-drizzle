import 'reflect-metadata';
import { Service } from '@asenajs/asena/decorators';
import { Inject } from '@asenajs/asena/decorators/ioc';
import { BaseRepository, type TableWithId } from '../Repository';

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
    // Extend the decorated class itself rather than BaseRepository. Extending
    // BaseRepository discarded the target's prototype chain, so anything the
    // repository inherited from an intermediate base class - methods, getters,
    // statics - was silently dropped.
    @Service(options.name || target.name)
    class RepositoryServiceClass extends (target as unknown as typeof BaseRepository<any>) {
      public constructor() {
        super();
        this.table = options.table; // Set the table schema
        // Record the backing database service name so the ALS-aware getter in
        // BaseRepository can look up the active transaction in multi-database
        // setups.
        (this as unknown as { databaseServiceName: string }).databaseServiceName = options.databaseService;
      }
    }

    // Add database injection via decorator to the wrapper class
    const databaseServiceName = options.databaseService;

    // Target the private backing field rather than `db` itself. The IoC
    // container installs an *own-property* getter for whatever key it sees,
    // and an own `db` would shadow the ALS-aware prototype getter on
    // BaseRepository (causing repository writes inside @Transaction to bypass
    // the active tx and hit the pool).
    Inject(databaseServiceName, (service: any) => service.connection)(RepositoryServiceClass.prototype, '_db');

    // No member or metadata copying. The wrapper `extends target`, so every method, getter,
    // static and metadata record on the target - and on anything the target itself extends - is
    // already reachable through the prototype chain, and every reader that matters walks it.
    //
    // The copy loops were not merely redundant, they were destructive. `getMetadataKeys` walks
    // the chain while `getMetadata` returns only the nearest value, so the metadata loop
    // flattened inherited records onto the wrapper as own properties. Two concrete failures:
    // it overwrote the DependencyKey written just above (dropping the `_db` injection the
    // moment the repository declared any @Inject of its own), and it copied an inherited
    // NameKey over the wrapper's own, so a decorated class extending another decorated class
    // registered under its parent's name.

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
