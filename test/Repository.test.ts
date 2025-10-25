import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { BaseRepository, type DrizzleDatabase } from '../lib/Repository';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';

// Create a test table schema
const testUsers = pgTable('test_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  age: text('age'),
});

type TestUser = typeof testUsers.$inferSelect;
type NewTestUser = typeof testUsers.$inferInsert;

// Concrete repository implementation for testing
class TestUserRepository extends BaseRepository<typeof testUsers> {
  // Public setter for testing purposes
  public setDb(db: DrizzleDatabase): void {
    this.db = db;
  }

  public setTable(table: typeof testUsers): void {
    this.table = table;
  }

  // Custom method for testing inheritance
  public async findByEmail(email: string): Promise<TestUser | null> {
    return this.findOne(eq(testUsers.email, email));
  }
}

describe('BaseRepository', () => {
  let repository: TestUserRepository;
  let mockDb: DrizzleDatabase;
  let mockData: TestUser[];

  beforeEach(() => {
    // Create mock users
    mockData = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Alice',
        email: 'alice@example.com',
        age: '25',
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Bob',
        email: 'bob@example.com',
        age: '30',
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'Charlie',
        email: 'charlie@example.com',
        age: '35',
      },
    ];

    // Create a comprehensive mock database
    mockDb = {
      select: mock(() => ({
        from: mock((table: any) => ({
          where: mock((condition: any) => ({
            limit: mock((count: number) => mockData.slice(0, count)),
            execute: mock(async () => mockData),
          })),
          limit: mock((count: number) => mockData.slice(0, count)),
          execute: mock(async () => mockData),
        })),
      })),
      insert: mock((table: any) => ({
        values: mock((values: any) => ({
          returning: mock(() => [{ ...values, id: 'new-uuid' }]),
          execute: mock(async () => [{ ...values, id: 'new-uuid' }]),
        })),
      })),
      update: mock((table: any) => ({
        set: mock((values: any) => ({
          where: mock((condition: any) => ({
            returning: mock(() => [{ id: '00000000-0000-0000-0000-000000000001', ...values }]),
            execute: mock(async () => [{ id: '00000000-0000-0000-0000-000000000001', ...values }]),
          })),
        })),
      })),
      delete: mock((table: any) => ({
        where: mock((condition: any) => ({
          returning: mock(() => [mockData[0]]),
          execute: mock(async () => [mockData[0]]),
        })),
      })),
      execute: mock(async (query: any) => ({ rows: [] })),
    };

    repository = new TestUserRepository();
    repository.setDb(mockDb);
    repository.setTable(testUsers);
  });

  describe('initialization', () => {
    it('should throw error when database is not initialized', () => {
      const uninitRepo = new TestUserRepository();
      expect(() => uninitRepo.db).toThrow('Database connection not initialized');
    });

    it('should throw error when table is not initialized', () => {
      const uninitRepo = new TestUserRepository();
      uninitRepo.setDb(mockDb);
      expect(() => uninitRepo.table).toThrow('Table not initialized');
    });

    it('should initialize correctly with db and table', () => {
      expect(repository.db).toBeDefined();
      expect(repository.table).toBeDefined();
      expect(repository.table).toBe(testUsers);
    });
  });

  describe('findById', () => {
    it('should find user by id', async () => {
      const userId = '00000000-0000-0000-0000-000000000001';

      // Mock specific behavior for findById
      const mockQuery = {
        from: mock((table: any) => ({
          where: mock((condition: any) => ({
            limit: mock((count: number) => [mockData[0]]),
          })),
        })),
      };
      // @ts-ignore
      mockDb.select = mock(() => mockQuery);

      const result = await repository.findById(userId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(userId);
      expect(result?.name).toBe('Alice');
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return null when user not found', async () => {
      const mockQuery = {
        from: mock((table: any) => ({
          where: mock((condition: any) => ({
            limit: mock((count: number) => []),
          })),
        })),
      };
      // @ts-ignore
      mockDb.select = mock(() => mockQuery);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should limit results to 1', async () => {
      const limitMock = mock((count: number) => {
        expect(count).toBe(1);
        return [mockData[0]];
      });

      const mockQuery = {
        from: mock((table: any) => ({
          where: mock((condition: any) => ({
            limit: limitMock,
          })),
        })),
      };
      // @ts-ignore
      mockDb.select = mock(() => mockQuery);

      await repository.findById('any-id');
      expect(limitMock).toHaveBeenCalledWith(1);
    });
  });

  describe('findAll', () => {
    it('should return all users without conditions', async () => {
      const executeMock = mock(async () => mockData);
      const mockQuery = {
        from: mock(() => ({
          where: mock(() => ({ execute: executeMock })),
          execute: executeMock,
        })),
      };
      mockDb.select = mock(() => mockQuery);

      const result = await repository.findAll();

      expect(result).toBeDefined();
      expect(result.length).toBe(3);
      expect(result[0].name).toBe('Alice');
      expect(executeMock).toHaveBeenCalled();
    });

    it('should filter users with where condition', async () => {
      const filteredData = [mockData[0]];
      const whereMock = mock((condition: any) => ({
        execute: mock(async () => filteredData),
      }));

      const mockQuery = {
        from: mock((table: any) => ({
          where: whereMock,
          execute: mock(async () => mockData),
        })),
      };
      mockDb.select = mock(() => mockQuery);

      const whereCondition = eq(testUsers.email, 'alice@example.com');
      await repository.findAll(whereCondition);

      expect(whereMock).toHaveBeenCalled();
    });

    it('should return empty array when no users exist', async () => {
      const mockQuery = {
        from: mock((table: any) => ({
          execute: mock(async () => []),
        })),
      };
      mockDb.select = mock(() => mockQuery);

      const result = await repository.findAll();

      expect(result).toBeDefined();
      expect(result.length).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should find single user with condition', async () => {
      const mockQuery = {
        from: mock((table: any) => ({
          where: mock((condition: any) => ({
            limit: mock((count: number) => [mockData[0]]),
          })),
        })),
      };
      // @ts-ignore
      mockDb.select = mock(() => mockQuery);

      const result = await repository.findOne(eq(testUsers.email, 'alice@example.com'));

      expect(result).toBeDefined();
      expect(result?.email).toBe('alice@example.com');
    });

    it('should return null when no match found', async () => {
      const mockQuery = {
        from: mock((table: any) => ({
          where: mock((condition: any) => ({
            limit: mock((count: number) => []),
          })),
        })),
      };
      // @ts-ignore
      mockDb.select = mock(() => mockQuery);

      const result = await repository.findOne(eq(testUsers.email, 'nonexistent@example.com'));

      expect(result).toBeNull();
    });

    it('should limit to 1 result even if multiple matches exist', async () => {
      const limitMock = mock((count: number) => {
        expect(count).toBe(1);
        return [mockData[0]];
      });

      const mockQuery = {
        from: mock((table: any) => ({
          where: mock((condition: any) => ({
            limit: limitMock,
          })),
        })),
      };
      // @ts-ignore
      mockDb.select = mock(() => mockQuery);

      await repository.findOne(eq(testUsers.name, 'Alice'));
      expect(limitMock).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('should create new user', async () => {
      const newUser: NewTestUser = {
        name: 'David',
        email: 'david@example.com',
        age: '40',
      };

      const returningMock = mock(() => [{ ...newUser, id: 'new-uuid-123' }]);
      const mockInsert = {
        values: mock((values: any) => ({
          returning: returningMock,
        })),
      };
      // @ts-ignore
      mockDb.insert = mock((table: any) => mockInsert);

      const result = await repository.create(newUser);

      expect(result).toBeDefined();
      expect(result.name).toBe('David');
      expect(result.id).toBe('new-uuid-123');
      expect(mockDb.insert).toHaveBeenCalledWith(testUsers);
      expect(returningMock).toHaveBeenCalled();
    });

    it('should handle user with minimal required fields', async () => {
      const minimalUser: NewTestUser = {
        name: 'Eve',
        email: 'eve@example.com',
      };

      const returningMock = mock(() => [{ ...minimalUser, id: 'new-id', age: null }]);
      // @ts-ignore
      mockDb.insert = mock((table: any) => ({
        values: mock((values: any) => ({
          returning: returningMock,
        })),
      }));

      const result = await repository.create(minimalUser);

      expect(result).toBeDefined();
      expect(result.name).toBe('Eve');
      expect(result.age).toBeNull();
    });
  });

  describe('custom methods', () => {
    it('should support custom repository methods', async () => {
      const mockQuery = {
        from: mock((table: any) => ({
          where: mock((condition: any) => ({
            limit: mock((count: number) => [mockData[1]]),
          })),
        })),
      };
      // @ts-ignore
      mockDb.select = mock(() => mockQuery);

      const result = await repository.findByEmail('bob@example.com');

      expect(result).toBeDefined();
      expect(result?.name).toBe('Bob');
      expect(result?.email).toBe('bob@example.com');
    });

    it('should return null for non-existent email', async () => {
      const mockQuery = {
        from: mock((table: any) => ({
          where: mock((condition: any) => ({
            limit: mock((count: number) => []),
          })),
        })),
      };
      // @ts-ignore
      mockDb.select = mock(() => mockQuery);

      const result = await repository.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('type safety', () => {
    it('should maintain type safety for select results', async () => {
      const mockQuery = {
        from: mock((table: any) => ({
          where: mock((condition: any) => ({
            limit: mock((count: number) => [mockData[0]]),
          })),
        })),
      };
      // @ts-ignore
      mockDb.select = mock(() => mockQuery);

      const result = await repository.findById('any-id');

      // TypeScript should infer correct types
      if (result) {
        expect(typeof result.id).toBe('string');
        expect(typeof result.name).toBe('string');
        expect(typeof result.email).toBe('string');
      }
    });

    it('should enforce required fields on insert', async () => {
      // This is a compile-time test, but we can verify runtime behavior
      const validUser: NewTestUser = {
        name: 'Test',
        email: 'test@example.com',
      };

      const returningMock = mock(() => [{ ...validUser, id: 'id' }]);
      // @ts-ignore
      mockDb.insert = mock((table: any) => ({
        values: mock((values: any) => ({ returning: returningMock })),
      }));

      const result = await repository.create(validUser);
      expect(result).toBeDefined();
    });
  });
});
