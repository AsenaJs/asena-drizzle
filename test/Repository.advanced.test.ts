import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { BaseRepository, type DrizzleDatabase } from '../lib/Repository';
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { eq, count, sql } from 'drizzle-orm';

// Test table schema
const testUsers = pgTable('test_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  status: text('status'),
});

type TestUser = typeof testUsers.$inferSelect;
type NewTestUser = typeof testUsers.$inferInsert;

class TestUserRepository extends BaseRepository<typeof testUsers> {
  public setDb(db: DrizzleDatabase): void {
    this.db = db;
  }

  public setTable(table: typeof testUsers): void {
    this.table = table;
  }
}

describe('BaseRepository - Advanced Operations', () => {
  let repository: TestUserRepository;
  let mockDb: DrizzleDatabase;
  let mockData: TestUser[];

  beforeEach(() => {
    mockData = [
      { id: '1', name: 'Alice', email: 'alice@test.com', status: 'active' },
      { id: '2', name: 'Bob', email: 'bob@test.com', status: 'inactive' },
      { id: '3', name: 'Charlie', email: 'charlie@test.com', status: 'active' },
      { id: '4', name: 'David', email: 'david@test.com', status: 'active' },
    ];

    mockDb = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => []),
            execute: mock(async () => []),
          })),
          limit: mock(() => []),
          offset: mock(() => ({ execute: mock(async () => []) })),
          execute: mock(async () => []),
        })),
      })),
      insert: mock(() => ({
        values: mock(() => ({
          returning: mock(() => []),
          execute: mock(async () => []),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => ({
            returning: mock(() => []),
            execute: mock(async () => []),
          })),
        })),
      })),
      delete: mock(() => ({
        where: mock(() => ({
          returning: mock(() => []),
          execute: mock(async () => []),
        })),
      })),
      execute: mock(async () => ({ rows: [] })),
    };

    repository = new TestUserRepository();
    repository.setDb(mockDb);
    repository.setTable(testUsers);
  });

  describe('updateById', () => {
    it('should update user by id', async () => {
      const updatedUser = { ...mockData[0], name: 'Alice Updated' };
      const returningMock = mock(() => [updatedUser]);

      // @ts-ignore
      mockDb.update = mock(() => ({
        set: mock((data: any) => {
          expect(data).toEqual({ name: 'Alice Updated' });
          return {
            where: mock(() => ({
              returning: returningMock,
            })),
          };
        }),
      }));

      const result = await repository.updateById('1', { name: 'Alice Updated' });

      expect(result).toBeDefined();
      expect(result?.name).toBe('Alice Updated');
      expect(mockDb.update).toHaveBeenCalled();
      expect(returningMock).toHaveBeenCalled();
    });

    it('should return undefined when user not found', async () => {
      // @ts-ignore
      mockDb.update = mock(() => ({
        set: mock(() => ({
          where: mock(() => ({
            returning: mock(() => []),
          })),
        })),
      }));

      const result = await repository.updateById('non-existent', { name: 'Test' });

      expect(result).toBeUndefined();
    });

    it('should handle partial updates', async () => {
      const updatedUser = { ...mockData[0], status: 'inactive' };

      // @ts-ignore
      mockDb.update = mock(() => ({
        set: mock((data: any) => {
          expect(data).toEqual({ status: 'inactive' });
          return {
            where: mock(() => ({
              returning: mock(() => [updatedUser]),
            })),
          };
        }),
      }));

      const result = await repository.updateById('1', { status: 'inactive' });

      expect(result?.status).toBe('inactive');
      expect(result?.name).toBe('Alice'); // Name should remain unchanged
    });
  });

  describe('update (bulk)', () => {
    it('should update multiple records with condition', async () => {
      const updatedUsers = [
        { ...mockData[0], status: 'archived' },
        { ...mockData[2], status: 'archived' },
      ];

      // @ts-ignore
      mockDb.update = mock(() => ({
        set: mock(() => ({
          where: mock(() => ({
            returning: mock(() => updatedUsers),
          })),
        })),
      }));

      const result = await repository.update(eq(testUsers.status, 'active'), {
        status: 'archived',
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(2);
      expect(result.every((u) => u.status === 'archived')).toBe(true);
    });

    it('should return empty array when no records match', async () => {
      // @ts-ignore
      mockDb.update = mock(() => ({
        set: mock(() => ({
          where: mock(() => ({
            returning: mock(() => []),
          })),
        })),
      }));

      const result = await repository.update(eq(testUsers.status, 'nonexistent'), {
        status: 'new',
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(0);
    });
  });

  describe('deleteById', () => {
    it('should delete user by id and return true', async () => {
      // @ts-ignore
      mockDb.delete = mock(() => ({
        where: mock(() => ({
          returning: mock(() => [mockData[0]]),
        })),
      }));

      const result = await repository.deleteById('1');

      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should return false when user not found', async () => {
      // @ts-ignore
      mockDb.delete = mock(() => ({
        where: mock(() => ({
          returning: mock(() => []),
        })),
      }));

      const result = await repository.deleteById('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('delete (bulk)', () => {
    it('should delete multiple records and return count', async () => {
      // @ts-ignore
      mockDb.delete = mock(() => ({
        where: mock(() => ({
          returning: mock(() => [mockData[1], mockData[3]]),
        })),
      }));

      const result = await repository.delete(eq(testUsers.status, 'inactive'));

      expect(result).toBe(2);
    });

    it('should return 0 when no records match', async () => {
      // @ts-ignore
      mockDb.delete = mock(() => ({
        where: mock(() => ({
          returning: mock(() => []),
        })),
      }));

      const result = await repository.delete(eq(testUsers.status, 'nonexistent'));

      expect(result).toBe(0);
    });
  });

  describe('createMany', () => {
    it('should create multiple records at once', async () => {
      const newUsers: NewTestUser[] = [
        { name: 'Eve', email: 'eve@test.com', status: 'active' },
        { name: 'Frank', email: 'frank@test.com', status: 'active' },
      ];

      const createdUsers = [
        { ...newUsers[0], id: 'new-1' },
        { ...newUsers[1], id: 'new-2' },
      ];

      // @ts-ignore
      mockDb.insert = mock(() => ({
        values: mock((data: any) => {
          expect(data).toEqual(newUsers);
          return {
            returning: mock(() => createdUsers),
          };
        }),
      }));

      const result = await repository.createMany(newUsers);

      expect(result).toBeDefined();
      expect(result.length).toBe(2);
      expect(result[0].name).toBe('Eve');
      expect(result[1].name).toBe('Frank');
    });

    it('should handle empty array', async () => {
      // @ts-ignore
      mockDb.insert = mock(() => ({
        values: mock(() => ({
          returning: mock(() => []),
        })),
      }));

      const result = await repository.createMany([]);

      expect(result).toBeDefined();
      expect(result.length).toBe(0);
    });
  });

  describe('count', () => {
    it('should count all records', async () => {
      const executeMock = mock(async () => [{ count: 4 }]);

      mockDb.select = mock(() => ({
        from: mock(() => ({
          execute: executeMock,
        })),
      }));

      const result = await repository.count();

      expect(result).toBe(4);
      expect(executeMock).toHaveBeenCalled();
    });

    it('should return 0 when table is empty', async () => {
      mockDb.select = mock(() => ({
        from: mock(() => ({
          execute: mock(async () => []),
        })),
      }));

      const result = await repository.count();

      expect(result).toBe(0);
    });

    it('should return 0 when result is null or undefined', async () => {
      mockDb.select = mock(() => ({
        from: mock(() => ({
          execute: mock(async () => null),
        })),
      }));

      const result = await repository.count();

      expect(result).toBe(0);
    });
  });

  describe('countBy', () => {
    it('should count records with condition', async () => {
      const executeMock = mock(async () => [{ count: 3 }]);

      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            execute: executeMock,
          })),
          execute: executeMock,
        })),
      }));

      const result = await repository.countBy(eq(testUsers.status, 'active'));

      expect(result).toBe(3);
    });

    it('should count all when no condition provided', async () => {
      mockDb.select = mock(() => ({
        from: mock(() => ({
          execute: mock(async () => [{ count: 4 }]),
        })),
      }));

      const result = await repository.countBy();

      expect(result).toBe(4);
    });
  });

  describe('exists', () => {
    it('should return true when record exists', async () => {
      // @ts-ignore
      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => [{ exists: true }]),
          })),
        })),
      }));

      const result = await repository.exists(eq(testUsers.email, 'alice@test.com'));

      expect(result).toBe(true);
    });

    it('should return false when record does not exist', async () => {
      // @ts-ignore
      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() => []),
          })),
        })),
      }));

      const result = await repository.exists(eq(testUsers.email, 'nonexistent@test.com'));

      expect(result).toBe(false);
    });

    it('should limit to 1 for performance', async () => {
      const limitMock = mock((count: number) => {
        expect(count).toBe(1);
        return [{ exists: true }];
      });

      // @ts-ignore
      mockDb.select = mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: limitMock,
          })),
        })),
      }));

      await repository.exists(eq(testUsers.id, '1'));
      expect(limitMock).toHaveBeenCalledWith(1);
    });
  });

  describe('paginate', () => {
    // Helper: creates a self-referencing query mock that mirrors Drizzle's mutable builder pattern
    function createQueryMock(data: any[]) {
      const query: any = { execute: mock(async () => data) };

      query.where = mock(() => query);
      query.limit = mock(() => query);
      query.offset = mock(() => query);
      query.orderBy = mock(() => query);

      return query;
    }

    function setupPaginate(total: number, data: any[]) {
      // @ts-ignore - spy countBy so we only need to mock the data query
      repository.countBy = mock(async () => total);

      const dataQuery = createQueryMock(data);

      // @ts-ignore
      mockDb.select = mock(() => ({ from: mock(() => dataQuery) }));

      return dataQuery;
    }

    it('should return paginated results with metadata', async () => {
      setupPaginate(4, mockData.slice(0, 2));

      const result = await repository.paginate(1, 2);

      expect(result).toBeDefined();
      expect(result.data).toEqual(mockData.slice(0, 2));
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.total).toBe(4);
      expect(result.totalPages).toBe(2);
    });

    it('should calculate correct offset for page 2', async () => {
      const dataQuery = setupPaginate(4, mockData.slice(2, 4));

      const result = await repository.paginate(2, 2);

      expect(result.page).toBe(2);
      expect(dataQuery.limit).toHaveBeenCalledWith(2);
      expect(dataQuery.offset).toHaveBeenCalledWith(2); // (2-1)*2 = 2
    });

    it('should use default pagination values', async () => {
      const dataQuery = setupPaginate(4, mockData);

      const result = await repository.paginate();

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(dataQuery.limit).toHaveBeenCalledWith(10);
      expect(dataQuery.offset).toHaveBeenCalledWith(0); // (1-1)*10 = 0
    });

    it('should handle filtering with where clause', async () => {
      const whereCondition = eq(testUsers.status, 'active');
      const dataQuery = setupPaginate(1, [mockData[0]]);

      await repository.paginate(1, 10, whereCondition);

      expect(repository.countBy).toHaveBeenCalledWith(whereCondition);
      expect(dataQuery.where).toHaveBeenCalledWith(whereCondition);
    });

    it('should calculate total pages correctly', async () => {
      setupPaginate(25, []);

      const result = await repository.paginate(1, 10);

      expect(result.totalPages).toBe(3); // ceil(25/10) = 3
    });

    it('should handle last page with fewer items', async () => {
      const dataQuery = setupPaginate(7, [mockData[0]]);

      const result = await repository.paginate(3, 3);

      expect(result.data.length).toBe(1);
      expect(result.totalPages).toBe(3); // ceil(7/3) = 3
      expect(dataQuery.offset).toHaveBeenCalledWith(6); // (3-1)*3 = 6
    });

    it('should handle empty results', async () => {
      setupPaginate(0, []);

      const result = await repository.paginate(1, 10);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('should clamp page to minimum 1', async () => {
      const dataQuery = setupPaginate(10, mockData);

      const result = await repository.paginate(0, 5);

      expect(result.page).toBe(1);
      expect(dataQuery.offset).toHaveBeenCalledWith(0);
    });

    it('should clamp limit to minimum 1', async () => {
      setupPaginate(10, mockData);

      const result = await repository.paginate(1, 0);

      expect(result.limit).toBe(1);
      expect(result.totalPages).toBe(10); // ceil(10/1) = 10
    });

    it('should pass where to both count and data queries', async () => {
      const whereCondition = eq(testUsers.status, 'active');
      const dataQuery = setupPaginate(2, [mockData[0]]);

      await repository.paginate(1, 10, whereCondition);

      expect(repository.countBy).toHaveBeenCalledWith(whereCondition);
      expect(dataQuery.where).toHaveBeenCalledWith(whereCondition);
    });

    it('should pass orderBy to data query', async () => {
      const orderByClause = sql`name ASC`;
      const dataQuery = setupPaginate(4, mockData);

      await repository.paginate(1, 10, undefined, orderByClause);

      expect(dataQuery.orderBy).toHaveBeenCalledWith(orderByClause);
      expect(dataQuery.where).not.toHaveBeenCalled();
    });
  });
});
