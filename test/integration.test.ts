import { describe, it, expect, beforeAll } from 'bun:test';
import { Database, Repository, BaseRepository, AsenaDatabaseService } from '../index';
import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';

// Test table schema
const testUsers = pgTable('test_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
});

// Test Database Service
@Database({
  type: 'bun-sql',
  config: {
    host: 'localhost',
    port: 5432,
    database: ':memory:',
    user: 'test',
    password: 'test',
  },
  name: 'TestDatabase',
})
class TestDatabase extends AsenaDatabaseService {}

// Test Repository
@Repository({
  table: testUsers,
  databaseService: 'TestDatabase',
  name: 'TestUserRepository',
})
class TestUserRepository extends BaseRepository<typeof testUsers> {

  public async findByEmail(email: string) {
    return this.findOne(eq(testUsers.email, email));
  }

}

describe('AsenaJS Drizzle Integration', () => {
  beforeAll(async () => {
    // Note: In a real test, you'd initialize the AsenaJS container
    // and let it handle the dependency injection
    console.log('Integration tests require a full AsenaJS application setup');
    console.log('This test demonstrates the expected API usage');
  });

  it('should export all expected modules', () => {
    expect(Database).toBeDefined();
    expect(Repository).toBeDefined();
    expect(BaseRepository).toBeDefined();
    expect(AsenaDatabaseService).toBeDefined();
  });

  it('should create database service class with decorator', () => {
    expect(TestDatabase).toBeDefined();
    expect(TestDatabase.name).toBe('TestDatabase');
  });

  it('should create repository class with decorator', () => {
    expect(TestUserRepository).toBeDefined();
    expect(TestUserRepository.name).toBe('TestUserRepository');
  });

  it('should have correct repository methods', () => {
    const repo = new TestUserRepository();

    // Check if all expected methods exist
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.findAll).toBe('function');
    expect(typeof repo.findOne).toBe('function');
    expect(typeof repo.create).toBe('function');
    expect(typeof repo.createMany).toBe('function');
    expect(typeof repo.updateById).toBe('function');
    expect(typeof repo.update).toBe('function');
    expect(typeof repo.deleteById).toBe('function');
    expect(typeof repo.delete).toBe('function');
    expect(typeof repo.count).toBe('function');
    expect(typeof repo.countBy).toBe('function');
    expect(typeof repo.paginate).toBe('function');
    expect(typeof repo.exists).toBe('function');
    expect(typeof repo.findByEmail).toBe('function');
  });
});
