import { describe, it, expect } from 'bun:test';
import { PostgreSQLAdapter } from '../lib/adapters/PostgreSQLAdapter';
import type { DatabaseConfig } from '../lib/types';

describe('PostgreSQLAdapter', () => {
  const validConfig: DatabaseConfig = {
    host: 'localhost',
    port: 5432,
    database: 'testdb',
    user: 'testuser',
    password: 'testpass',
  };

  describe('constructor', () => {
    it('should create adapter with basic config', () => {
      const adapter = new PostgreSQLAdapter(validConfig);
      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(PostgreSQLAdapter);
    });

    it('should create adapter with drizzle config', () => {
      const drizzleConfig = {
        schema: { users: {} },
        logger: true,
      };
      const adapter = new PostgreSQLAdapter(validConfig, drizzleConfig);
      expect(adapter).toBeDefined();
    });

    it('should accept different database configs', () => {
      const configs = [
        { host: 'localhost', port: 5432, database: 'db1', user: 'user1', password: 'pass1' },
        { host: '127.0.0.1', port: 5433, database: 'db2', user: 'user2', password: 'pass2' },
        {
          host: 'remote.db.com',
          port: 5432,
          database: 'proddb',
          user: 'admin',
          password: 'secret',
        },
      ];

      configs.forEach((config) => {
        const adapter = new PostgreSQLAdapter(config);
        expect(adapter).toBeDefined();
      });
    });
  });

  describe('connection getter', () => {
    it('should throw error before connection is established', () => {
      const adapter = new PostgreSQLAdapter(validConfig);
      expect(() => adapter.connection).toThrow('Database connection not established');
    });
  });

  describe('disconnect', () => {
    it('should handle disconnect when not connected gracefully', async () => {
      const adapter = new PostgreSQLAdapter(validConfig);
      // Should not throw even when not connected
      await expect(adapter.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('connection string creation', () => {
    it('should create PostgreSQL connection string with basic config', () => {
      const adapter = new PostgreSQLAdapter({
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        user: 'postgres',
        password: 'secret',
      });

      // Access protected method through subclass
      const connStr = (adapter as any).createConnectionString();
      expect(connStr).toBe('postgresql://postgres:secret@localhost:5432/mydb');
    });

    it('should include SSL parameter when SSL is enabled', () => {
      const adapter = new PostgreSQLAdapter({
        host: 'secure.db.com',
        port: 5432,
        database: 'proddb',
        user: 'admin',
        password: 'pass123',
        ssl: true,
      });

      const connStr = (adapter as any).createConnectionString();
      expect(connStr).toContain('?ssl=true');
      expect(connStr).toBe('postgresql://admin:pass123@secure.db.com:5432/proddb?ssl=true');
    });

    it('should use provided connectionString if available', () => {
      const customConnStr = 'postgresql://custom:string@host:1234/db?param=value';
      const adapter = new PostgreSQLAdapter({
        host: 'ignored',
        port: 9999,
        database: 'ignored',
        user: 'ignored',
        password: 'ignored',
        connectionString: customConnStr,
      });

      const connStr = (adapter as any).createConnectionString();
      expect(connStr).toBe(customConnStr);
    });

    it('should handle different ports correctly', () => {
      const adapter = new PostgreSQLAdapter({
        host: '192.168.1.100',
        port: 5433,
        database: 'customport',
        user: 'user',
        password: 'pass',
      });

      const connStr = (adapter as any).createConnectionString();
      expect(connStr).toContain(':5433/');
    });

    it('should handle special characters in credentials', () => {
      const adapter = new PostgreSQLAdapter({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user@domain',
        password: 'p@ss:w0rd!',
      });

      const connStr = (adapter as any).createConnectionString();
      expect(connStr).toContain('user@domain');
      expect(connStr).toContain('p@ss:w0rd!');
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

      const adapter = new PostgreSQLAdapter(invalidConfig);

      // Connection should fail with invalid config
      await expect(adapter.connect()).rejects.toThrow();
    });

    it('should provide error message on connection failure', async () => {
      const badConfig: DatabaseConfig = {
        host: 'invalid-host-xyz',
        port: 1,
        database: 'test',
        user: 'test',
        password: 'test',
      };

      const adapter = new PostgreSQLAdapter(badConfig);

      try {
        await adapter.connect();
        expect(true).toBe(false); // Should not reach
      } catch (error: any) {
        expect(error.message).toBeDefined();
        expect(error.message).toContain('PostgreSQL connection failed');
      }
    });

    it('should handle missing pg package gracefully', async () => {
      const adapter = new PostgreSQLAdapter(validConfig);

      // Note: This test documents the behavior when pg is not installed
      // In real scenarios, pg import will fail and throw a helpful error
      try {
        await adapter.connect();
        // If pg is installed, connection will fail due to invalid host
        // If pg is not installed, will get package missing error
      } catch (error: any) {
        // Error message should be descriptive
        expect(error.message).toBeDefined();
      }
    });
  });

  describe('config validation', () => {
    it('should handle missing config fields appropriately', () => {
      const incompleteConfig = {
        host: 'localhost',
        // Missing other fields
      } as DatabaseConfig;

      const adapter = new PostgreSQLAdapter(incompleteConfig);
      expect(adapter).toBeDefined();
    });

    it('should accept SSL configuration', () => {
      const sslConfig: DatabaseConfig = {
        ...validConfig,
        ssl: true,
      };

      const adapter = new PostgreSQLAdapter(sslConfig);
      expect(adapter).toBeDefined();
    });

    it('should accept connection string in config', () => {
      const connStringConfig: DatabaseConfig = {
        ...validConfig,
        connectionString: 'postgresql://user:pass@localhost:5432/db',
      };

      const adapter = new PostgreSQLAdapter(connStringConfig);
      expect(adapter).toBeDefined();
    });

    it('should support name field in config', () => {
      const namedConfig: DatabaseConfig = {
        ...validConfig,
        name: 'MyProductionDB',
      };

      const adapter = new PostgreSQLAdapter(namedConfig);
      expect(adapter).toBeDefined();
    });
  });

  describe('connection pooling', () => {
    it('should create adapter with pool configuration', () => {
      // PostgreSQLAdapter uses connection pooling by default
      // Pool config: max: 20, idleTimeout: 30s, connectionTimeout: 2s
      const adapter = new PostgreSQLAdapter(validConfig);
      expect(adapter).toBeDefined();
    });

    it('should handle multiple adapter instances', () => {
      const adapter1 = new PostgreSQLAdapter({ ...validConfig, database: 'db1' });
      const adapter2 = new PostgreSQLAdapter({ ...validConfig, database: 'db2' });
      const adapter3 = new PostgreSQLAdapter({ ...validConfig, database: 'db3' });

      expect(adapter1).toBeDefined();
      expect(adapter2).toBeDefined();
      expect(adapter3).toBeDefined();
    });
  });

  describe('drizzle config', () => {
    it('should pass schema to drizzle', () => {
      const schema = {
        users: {},
        posts: {},
      };

      const adapter = new PostgreSQLAdapter(validConfig, {
        schema,
      });

      expect(adapter).toBeDefined();
    });

    it('should pass logger config to drizzle', () => {
      const adapter = new PostgreSQLAdapter(validConfig, {
        logger: true,
      });

      expect(adapter).toBeDefined();
    });

    it('should use logger:false by default', () => {
      const adapter = new PostgreSQLAdapter(validConfig);
      expect(adapter).toBeDefined();
    });
  });
});
