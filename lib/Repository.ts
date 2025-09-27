import { type Column, count, eq, type SQL, sql, type Table } from 'drizzle-orm';

export interface TableWithId extends Table {
  id: Column;
}

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

export abstract class BaseRepository<
  T extends TableWithId,
  DatabaseConnection extends DrizzleDatabase = DrizzleDatabase,
  SelectType = T['$inferSelect'],
  InsertType = T['$inferInsert'],
  IdType = SelectType extends { id: infer U } ? U : string,
> {

  protected db: DatabaseConnection;

  protected table: T;

  // Basic find by ID
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

  // Find all with optional conditions
  public async findAll(where?: SQL): Promise<SelectType[]> {
    const query = this.db.select().from(this.table as any);

    if (where) {
      query.where(where);
    }

    const result = await query.execute();

    return result as SelectType[];
  }

  // Find one with conditions
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

  // Create new record
  public async create(data: InsertType): Promise<SelectType> {
    const result = await this.db
      .insert(this.table as any)
      .values(data as any)
      .returning();

    return result[0] as SelectType;
  }

  // Create multiple records
  public async createMany(data: InsertType[]): Promise<SelectType[]> {
    const result = await this.db
      .insert(this.table as any)
      .values(data)
      .returning();

    return result as SelectType[];
  }

  // Update by ID
  public async updateById(id: IdType, data: Partial<InsertType>): Promise<SelectType | undefined> {
    const result = await this.db
      .update(this.table as any)
      .set(data)
      .where(eq(this.table.id, id))
      .returning();

    return result[0] as SelectType | undefined;
  }

  // Update with conditions
  public async update(where: SQL, data: Partial<InsertType>): Promise<SelectType[]> {
    const result = await this.db
      .update(this.table as any)
      .set(data)
      .where(where)
      .returning();

    return result as SelectType[];
  }

  // Delete by ID
  public async deleteById(id: IdType): Promise<boolean> {
    const result = await this.db
      .delete(this.table as any)
      .where(eq(this.table.id, id))
      .returning();

    return result.length > 0;
  }

  // Delete with conditions
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

  // Paginated results
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

  // Check if record exists
  public async exists(where: SQL): Promise<boolean> {
    const result = await this.db
      .select({ exists: sql<boolean>`1` })
      .from(this.table as any)
      .where(where)
      .limit(1);

    return result.length > 0;
  }

}
