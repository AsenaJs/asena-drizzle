import { describe, expect, it } from 'bun:test';
import { BunSQLAdapter } from '../lib/adapters/BunSQLAdapter';
import type { DatabaseConfig } from '../lib/types';

// Create a simpler test approach - test configuration and error handling
// without mocking the entire Bun.SQL infrastructure

describe('BunSQLAdapter', () => {
  const validConfig: DatabaseConfig = {
    host: 'localhost',
    port: 5432,
    database: 'testdb',
    user: 'testuser',
    password: 'testpass',
  };

  describe('constructor', () => {
    it('should create adapter with basic config', () => {
      const adapter = new BunSQLAdapter(validConfig);
      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(BunSQLAdapter);
    });

    it('should create adapter with drizzle config', () => {
      const drizzleConfig = {
        schema: { users: {} },
        logger: true,
      };
      const adapter = new BunSQLAdapter(validConfig, drizzleConfig);
      expect(adapter).toBeDefined();
    });

    it('should accept different database configs', () => {
      const configs = [
        { host: 'localhost', port: 5432, database: 'db1', user: 'user1', password: 'pass1' },
        { host: '127.0.0.1', port: 3306, database: 'db2', user: 'user2', password: 'pass2' },
        {
          host: 'remote.db.com',
          port: 5433,
          database: 'proddb',
          user: 'admin',
          password: 'secret',
        },
      ];

      configs.forEach((config) => {
        const adapter = new BunSQLAdapter(config);
        expect(adapter).toBeDefined();
      });
    });
  });

  describe('connection getter', () => {
    it('should throw error before connection is established', () => {
      const adapter = new BunSQLAdapter(validConfig);
      expect(() => adapter.connection).toThrow('Database connection not established');
    });
  });

  describe('disconnect', () => {
    it('should handle disconnect when not connected gracefully', async () => {
      const adapter = new BunSQLAdapter(validConfig);
      // Should not throw even when not connected
      expect(adapter.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('error scenarios', () => {
    it('should throw error on invalid connection attempt', async () => {
      const invalidConfig: DatabaseConfig = {
        host: 'definitely-invalid-host-12345.fake',
        port: 99999,
        database: 'nonexistent',
        user: 'fake',
        password: 'fake',
      };

      const adapter = new BunSQLAdapter(invalidConfig);

      // Connection should fail with invalid config
      expect(adapter.connect()).rejects.toThrow();
    });

    it('should provide error message on connection failure', async () => {
      const badConfig: DatabaseConfig = {
        host: 'invalid-host-xyz',
        port: 1,
        database: 'test',
        user: 'test',
        password: 'test',
      };

      const adapter = new BunSQLAdapter(badConfig);

      try {
        await adapter.connect();
        expect(true).toBe(false); // Should not reach
      } catch (error: any) {
        expect(error.message).toBeDefined();
        expect(error.message).toContain('Database connection failed');
      }
    });
  });

  describe('config validation', () => {
    it('should handle missing config fields appropriately', async () => {
      const incompleteConfig = {
        host: 'localhost',
        // Missing port, should use default or fail
      } as DatabaseConfig;

      const adapter = new BunSQLAdapter(incompleteConfig);
      // Should either use defaults or throw error
      expect(adapter).toBeDefined();
    });

    it('should accept SSL configuration', () => {
      const sslConfig: DatabaseConfig = {
        ...validConfig,
        ssl: true,
      };

      const adapter = new BunSQLAdapter(sslConfig);
      expect(adapter).toBeDefined();
    });

    it('should accept connection string in config', () => {
      const connStringConfig: DatabaseConfig = {
        ...validConfig,
        connectionString: 'postgresql://user:pass@localhost:5432/db',
      };

      const adapter = new BunSQLAdapter(connStringConfig);
      expect(adapter).toBeDefined();
    });
  });
});
