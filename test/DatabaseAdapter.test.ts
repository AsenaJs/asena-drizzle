import { describe, it, expect, beforeEach } from 'bun:test';
import { DatabaseAdapter } from '../lib/adapters/DatabaseAdapter';
import type { DatabaseConfig } from '../lib/types';

// Mock adapter for testing the abstract base class
class MockDatabaseAdapter extends DatabaseAdapter<any> {
  public constructor(config: DatabaseConfig) {
    super(config);
  }

  // Manually set connection for testing
  public setConnection(connection: any): void {
    this._connection = connection;
  }

  public async connect(): Promise<any> {
    this._connection = { connected: true };
    return this._connection;
  }

  public async disconnect(): Promise<void> {
    this._connection = null;
  }
}

describe('DatabaseAdapter', () => {
  describe('connection getter', () => {
    let adapter: MockDatabaseAdapter;

    beforeEach(() => {
      adapter = new MockDatabaseAdapter({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'test',
        password: 'test',
      });
    });

    it('should throw error when connection is not established', () => {
      expect(() => adapter.connection).toThrow('Database connection not established. Call connect() first.');
    });

    it('should return connection when established', async () => {
      await adapter.connect();
      const connection = adapter.connection;

      expect(connection).toBeDefined();
      expect(connection.connected).toBe(true);
    });

    it('should throw error after disconnect', async () => {
      await adapter.connect();
      await adapter.disconnect();

      expect(() => adapter.connection).toThrow('Database connection not established. Call connect() first.');
    });
  });

  describe('testConnection', () => {
    let adapter: MockDatabaseAdapter;

    beforeEach(() => {
      adapter = new MockDatabaseAdapter({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'test',
        password: 'test',
      });
    });

    it('should return false when connection is null', async () => {
      const result = await adapter.testConnection();
      expect(result).toBe(false);
    });

    it('should return true when connection has execute method that succeeds', async () => {
      const mockConnection = {
        execute: async () => ({ rows: [{ '?column?': 1 }] }),
      };

      adapter.setConnection(mockConnection);
      const result = await adapter.testConnection();
      expect(result).toBe(true);
    });

    it('should return false when execute throws error', async () => {
      const mockConnection = {
        execute: async () => {
          throw new Error('Connection failed');
        },
      };

      adapter.setConnection(mockConnection);
      const result = await adapter.testConnection();
      expect(result).toBe(false);
    });

    it('should return false when connection does not have execute method', async () => {
      adapter.setConnection({ invalid: true });
      const result = await adapter.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('connect and disconnect lifecycle', () => {
    it('should connect successfully', async () => {
      const adapter = new MockDatabaseAdapter({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'test',
        password: 'test',
      });

      const connection = await adapter.connect();
      expect(connection).toBeDefined();
      expect(connection.connected).toBe(true);
    });

    it('should disconnect successfully', async () => {
      const adapter = new MockDatabaseAdapter({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'test',
        password: 'test',
      });

      await adapter.connect();
      await adapter.disconnect();

      // Connection should be null after disconnect
      expect(() => adapter.connection).toThrow();
    });

    it('should allow reconnect after disconnect', async () => {
      const adapter = new MockDatabaseAdapter({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'test',
        password: 'test',
      });

      await adapter.connect();
      await adapter.disconnect();
      await adapter.connect();

      const connection = adapter.connection;
      expect(connection).toBeDefined();
      expect(connection.connected).toBe(true);
    });
  });
});
