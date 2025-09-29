import { type Column, count, eq, type SQL, sql, type Table } from 'drizzle-orm';

/**
 * Table interface that requires an 'id' column.
 * All tables used with BaseRepository must have an id column.
 *
 * @interface TableWithId
 * @extends {Table}
 */
export interface TableWithId extends Table {
  id: Column;
}

/**
 * Type definition for Drizzle database connection interface.
 * Provides a common interface for different Drizzle database types.
 *
 * @interface DrizzleDatabase
 */
export interface DrizzleDatabase {
  select(fields?: any): {
    from(source: any): {
      where?(condition: any): any;
      orderBy?(field: any): any;
      limit?(count: number): any;
      offset?(count: number): any;
      execute(): Promise<any>;
    };
  };
  insert(table: any): {
    values(values: any): {
      returning?(): any;
      execute(): Promise<any>;
    };
  };
  update(table: any): {
    set(values: any): {
      where(condition: any): {
        returning?(): any;
        execute(): Promise<any>;
      };
    };
  };
  delete(table: any): {
    where(condition: any): {
      returning?(): any;
      execute(): Promise<any>;
    };
  };
  execute(query: any): Promise<any>;
}

/**
 * Base repository class providing common CRUD operations for Drizzle ORM entities.
 *
 * This abstract class provides a complete set of database operations including:
 * - **CRUD Operations**: Create, read, update, delete
 * - **Querying**: Find by ID, find one, find all with conditions
 * - **Pagination**: Built-in pagination support
 * - **Counting**: Count records with or without filters
 * - **Batch Operations**: Create multiple records at once
 *
 * Extend this class and use the @Repository decorator to create type-safe repositories
 * for your database tables.
 *
 * @template T - The Drizzle table schema type (must extend TableWithId)
 * @template DatabaseConnection - The Drizzle database connection type
 * @template SelectType - Inferred select type from the table schema
 * @template InsertType - Inferred insert type from the table schema
 * @template IdType - Inferred ID column type from the table schema
 *
 * @example
 * ```typescript
 * // Define your table schema
 * const users = pgTable('users', {
 *   id: uuid('id').primaryKey().defaultRandom(),
 *   name: text('name').notNull(),
 *   email: text('email').notNull(),
 * });
 *
 * // Create a repository
 * @Repository({
 *   table: users,
 *   databaseService: 'MyDatabase'
 * })
 * export class UserRepository extends BaseRepository<typeof users> {
 *   // All CRUD methods are automatically available
 *   // Add custom methods as needed
 *
 *   async findByEmail(email: string) {
 *     return this.findOne(eq(users.email, email));
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Using the repository
 * class UserService {
 *   constructor(private userRepo: UserRepository) {}
 *
 *   async createUser(data: { name: string; email: string }) {
 *     return await this.userRepo.create(data);
 *   }
 *
 *   async getUser(id: string) {
 *     return await this.userRepo.findById(id);
 *   }
 *
 *   async getAllUsers() {
 *     return await this.userRepo.findAll();
 *   }
 *
 *   async updateUser(id: string, data: Partial<{ name: string; email: string }>) {
 *     return await this.userRepo.updateById(id, data);
 *   }
 *
 *   async deleteUser(id: string) {
 *     return await this.userRepo.deleteById(id);
 *   }
 * }
 * ```
 */
export abstract class BaseRepository<
  T extends TableWithId,
  DatabaseConnection extends DrizzleDatabase = DrizzleDatabase,
  SelectType = T['$inferSelect'],
  InsertType = T['$inferInsert'],
  IdType = SelectType extends { id: infer U } ? U : string,
> {

  private _db!: DatabaseConnection; // Will be injected by AsenaJS IoC

  private _table!: T; // Will be set by @Repository decorator

  /**
   * Gets the Drizzle database connection instance.
   *
   * @returns {DatabaseConnection} The database connection
   * @throws {Error} If database connection is not initialized
   */
  public get db(): DatabaseConnection {
    if (!this._db) {
      throw new Error('Database connection not initialized. Make sure @Repository decorator is applied properly.');
    }

    return this._db;
  }

  // Setter for database connection (used by decorator)
  protected set db(database: DatabaseConnection) {
    this._db = database;
  }

  /**
   * Gets the table schema instance.
   *
   * @returns {T} The table schema
   * @throws {Error} If table is not initialized
   */
  public get table(): T {
    if (!this._table) {
      throw new Error('Table not initialized. Make sure @Repository decorator includes table option.');
    }

    return this._table;
  }

  // Setter for table (used by decorator)
  public set table(tableSchema: T) {
    this._table = tableSchema;
  }

  /**
   * Finds a single record by its ID.
   *
   * @param {IdType} id - The ID of the record to find
   * @returns {Promise<SelectType | null>} The found record or null if not found
   *
   * @example
   * ```typescript
   * const user = await userRepo.findById('123e4567-e89b-12d3-a456-426614174000');
   * if (user) {
   *   console.log(user.name);
   * }
   * ```
   */
  public async findById(id: IdType): Promise<SelectType | null> {
    const result = await this.db
      .select()
      .from(this.table as any) // Type assertion still needed
      .where(eq((this.table as any).id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0] as SelectType;
  }

  /**
   * Finds all records, optionally filtered by a WHERE condition.
   *
   * @param {SQL} [where] - Optional Drizzle SQL WHERE condition
   * @returns {Promise<SelectType[]>} Array of found records
   *
   * @example
   * ```typescript
   * // Get all users
   * const allUsers = await userRepo.findAll();
   *
   * // Get filtered users
   * const activeUsers = await userRepo.findAll(eq(users.active, true));
   * ```
   */
  public async findAll(where?: SQL): Promise<SelectType[]> {
    const query = this.db.select().from(this.table as any);

    if (where) {
      query.where(where);
    }

    const result = await query.execute();

    return result as SelectType[];
  }

  /**
   * Finds a single record matching the given condition.
   *
   * @param {SQL<unknown> | undefined} where - Drizzle SQL WHERE condition
   * @returns {Promise<SelectType | null>} The found record or null if not found
   *
   * @example
   * ```typescript
   * const user = await userRepo.findOne(eq(users.email, 'john@example.com'));
   * ```
   */
  public async findOne(where: SQL<unknown> | undefined): Promise<SelectType | null> {
    const result = await this.db
      .select()
      .from(this.table as any)
      .where(where)
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0] as SelectType;
  }

  /**
   * Creates a new record in the database.
   *
   * @param {InsertType} data - The data for the new record
   * @returns {Promise<SelectType>} The created record
   *
   * @example
   * ```typescript
   * const newUser = await userRepo.create({
   *   name: 'John Doe',
   *   email: 'john@example.com'
   * });
   * console.log(newUser.id); // Auto-generated ID
   * ```
   */
  public async create(data: InsertType): Promise<SelectType> {
    const result = await this.db
      .insert(this.table as any)
      .values(data as any)
      .returning();

    return result[0] as SelectType;
  }

  /**
   * Creates multiple records in a single database operation.
   *
   * @param {InsertType[]} data - Array of data for new records
   * @returns {Promise<SelectType[]>} Array of created records
   *
   * @example
   * ```typescript
   * const newUsers = await userRepo.createMany([
   *   { name: 'John', email: 'john@example.com' },
   *   { name: 'Jane', email: 'jane@example.com' }
   * ]);
   * ```
   */
  public async createMany(data: InsertType[]): Promise<SelectType[]> {
    const result = await this.db
      .insert(this.table as any)
      .values(data)
      .returning();

    return result as SelectType[];
  }

  /**
   * Updates a record by its ID.
   *
   * @param {IdType} id - The ID of the record to update
   * @param {Partial<InsertType>} data - Partial data to update
   * @returns {Promise<SelectType | undefined>} The updated record or undefined if not found
   *
   * @example
   * ```typescript
   * const updated = await userRepo.updateById('user-id', {
   *   name: 'John Smith'
   * });
   * ```
   */
  public async updateById(id: IdType, data: Partial<InsertType>): Promise<SelectType | undefined> {
    const result = await this.db
      .update(this.table as any)
      .set(data)
      .where(eq(this.table.id, id))
      .returning();

    return result[0] as SelectType | undefined;
  }

  /**
   * Updates multiple records matching the given condition.
   *
   * @param {SQL} where - Drizzle SQL WHERE condition
   * @param {Partial<InsertType>} data - Partial data to update
   * @returns {Promise<SelectType[]>} Array of updated records
   *
   * @example
   * ```typescript
   * const updated = await userRepo.update(
   *   eq(users.active, false),
   *   { status: 'inactive' }
   * );
   * ```
   */
  public async update(where: SQL, data: Partial<InsertType>): Promise<SelectType[]> {
    const result = await this.db
      .update(this.table as any)
      .set(data)
      .where(where)
      .returning();

    return result as SelectType[];
  }

  /**
   * Deletes a record by its ID.
   *
   * @param {IdType} id - The ID of the record to delete
   * @returns {Promise<boolean>} True if record was deleted, false if not found
   *
   * @example
   * ```typescript
   * const deleted = await userRepo.deleteById('user-id');
   * if (deleted) {
   *   console.log('User deleted successfully');
   * }
   * ```
   */
  public async deleteById(id: IdType): Promise<boolean> {
    const result = await this.db
      .delete(this.table as any)
      .where(eq(this.table.id, id))
      .returning();

    return result.length > 0;
  }

  /**
   * Deletes multiple records matching the given condition.
   *
   * @param {SQL} where - Drizzle SQL WHERE condition
   * @returns {Promise<number>} Number of deleted records
   *
   * @example
   * ```typescript
   * const count = await userRepo.delete(eq(users.active, false));
   * console.log(`Deleted ${count} inactive users`);
   * ```
   */
  public async delete(where: SQL): Promise<number> {
    const result = await this.db
      .delete(this.table as any)
      .where(where)
      .returning();

    return result.length;
  }

  // Count records
  public async countBy(where?: SQL): Promise<number> {
    const query = this.db.select({ count: sql<number>`count(*)` }).from(this.table as any);

    if (where) {
      query.where(where);
    }

    const result = await query.execute();

    return result[0].count;
  }

  /**
   * Counts all records in the table.
   *
   * @returns {Promise<number>} Total number of records
   *
   * @example
   * ```typescript
   * const totalUsers = await userRepo.count();
   * console.log(`Total users: ${totalUsers}`);
   * ```
   */
  public async count(): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(this.table as any)
      .execute();

    if (!result || result.length === 0) {
      return 0;
    }

    return result[0].count;
  }

  /**
   * Returns paginated results with metadata.
   *
   * @param {number} [page=1] - Page number (1-based)
   * @param {number} [limit=10] - Number of records per page
   * @param {SQL} [where] - Optional WHERE condition
   * @param {SQL} [orderBy] - Optional ORDER BY clause
   * @returns {Promise<{data: SelectType[], total: number, page: number, limit: number, totalPages: number}>} Paginated results with metadata
   *
   * @example
   * ```typescript
   * const result = await userRepo.paginate(1, 20);
   * console.log(result.data); // Array of users
   * console.log(result.totalPages); // Total number of pages
   *
   * // With filtering and sorting
   * const filtered = await userRepo.paginate(
   *   1,
   *   10,
   *   eq(users.active, true),
   *   desc(users.createdAt)
   * );
   * ```
   */
  // eslint-disable-next-line max-params
  public async paginate(
    page = 1,
    limit = 10,
    where?: SQL,
    orderBy?: SQL,
  ): Promise<{
    data: SelectType[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;

    // Get total count
    const total = await this.countBy(where);

    // Build query
    const query = this.db.select().from(this.table as any);

    if (where) {
      query.where(where);
    }

    if (orderBy) {
      query.orderBy(orderBy);
    }

    query.limit(limit).offset(offset);

    const data = (await query.execute()) as SelectType[];

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Checks if a record matching the condition exists.
   *
   * @param {SQL} where - Drizzle SQL WHERE condition
   * @returns {Promise<boolean>} True if record exists, false otherwise
   *
   * @example
   * ```typescript
   * const emailExists = await userRepo.exists(
   *   eq(users.email, 'john@example.com')
   * );
   *
   * if (emailExists) {
   *   throw new Error('Email already registered');
   * }
   * ```
   */
  public async exists(where: SQL): Promise<boolean> {
    const result = await this.db
      .select({ exists: sql<boolean>`1` })
      .from(this.table as any)
      .where(where)
      .limit(1);

    return result.length > 0;
  }

}
