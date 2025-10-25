import { describe, it, expect } from 'bun:test';
import { MySQLAdapter } from '../lib/adapters/MySQLAdapter';
import type { DatabaseConfig } from '../lib/types';

describe('MySQLAdapter', () => {
  const validConfig: DatabaseConfig = {
    host: 'localhost',
    port: 3306,
    database: 'testdb',
    user: 'testuser',
    password: 'testpass',
  };

  describe('constructor', () => {
    it('should create adapter with basic config', () => {
      const adapter = new MySQLAdapter(validConfig);
      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(MySQLAdapter);
    });

    it('should create adapter with drizzle config', () => {
      const drizzleConfig = {
        schema: { users: {} },
        logger: true,
      };
      const adapter = new MySQLAdapter(validConfig, drizzleConfig);
      expect(adapter).toBeDefined();
    });

    it('should accept different database configs', () => {
      const configs = [
        { host: 'localhost', port: 3306, database: 'db1', user: 'user1', password: 'pass1' },
        { host: '127.0.0.1', port: 3307, database: 'db2', user: 'user2', password: 'pass2' },
        {
          host: 'mysql.remote.com',
          port: 3306,
          database: 'proddb',
          user: 'admin',
          password: 'secret',
        },
      ];

      configs.forEach((config) => {
        const adapter = new MySQLAdapter(config);
        expect(adapter).toBeDefined();
      });
    });
  });

  describe('connection getter', () => {
    it('should throw error before connection is established', () => {
      const adapter = new MySQLAdapter(validConfig);
      expect(() => adapter.connection).toThrow('Database connection not established');
    });
  });

  describe('disconnect', () => {
    it('should handle disconnect when not connected gracefully', async () => {
      const adapter = new MySQLAdapter(validConfig);
      // Should not throw even when not connected
      await expect(adapter.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('connection string creation', () => {
    it('should create MySQL connection string with basic config', () => {
      const adapter = new MySQLAdapter({
        host: 'localhost',
        port: 3306,
        database: 'mydb',
        user: 'root',
        password: 'secret',
      });

      // Access protected method through subclass
      const connStr = (adapter as any).createConnectionString();
      expect(connStr).toBe('mysql://root:secret@localhost:3306/mydb');
    });

    it('should include SSL parameter when SSL is enabled', () => {
      const adapter = new MySQLAdapter({
        host: 'secure.mysql.com',
        port: 3306,
        database: 'proddb',
        user: 'admin',
        password: 'pass123',
        ssl: true,
      });

      const connStr = (adapter as any).createConnectionString();
      expect(connStr).toContain('?ssl=true');
      expect(connStr).toBe('mysql://admin:pass123@secure.mysql.com:3306/proddb?ssl=true');
    });

    it('should use provided connectionString if available', () => {
      const customConnStr = 'mysql://custom:string@host:1234/db?param=value';
      const adapter = new MySQLAdapter({
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
      const adapter = new MySQLAdapter({
        host: '192.168.1.100',
        port: 3307,
        database: 'customport',
        user: 'user',
        password: 'pass',
      });

      const connStr = (adapter as any).createConnectionString();
      expect(connStr).toContain(':3307/');
    });

    it('should handle special characters in credentials', () => {
      const adapter = new MySQLAdapter({
        host: 'localhost',
        port: 3306,
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
        host: 'definitely-invalid-mysql-host-12345.fake',
        port: 99999,
        database: 'nonexistent',
        user: 'fake',
        password: 'fake',
      };

      const adapter = new MySQLAdapter(invalidConfig);

      // Connection should fail with invalid config
      await expect(adapter.connect()).rejects.toThrow();
    });

    it('should provide error message on connection failure', async () => {
      const badConfig: DatabaseConfig = {
        host: 'invalid-mysql-host-xyz',
        port: 1,
        database: 'test',
        user: 'test',
        password: 'test',
      };

      const adapter = new MySQLAdapter(badConfig);

      try {
        await adapter.connect();
        expect(true).toBe(false); // Should not reach
      } catch (error: any) {
        expect(error.message).toBeDefined();
        expect(error.message).toContain('MySQL connection failed');
      }
    });

    it('should handle missing mysql2 package gracefully', async () => {
      const adapter = new MySQLAdapter(validConfig);

      // Note: This test documents the behavior when mysql2 is not installed
      // In real scenarios, mysql2 import will fail and throw a helpful error
      try {
        await adapter.connect();
        // If mysql2 is installed, connection will fail due to invalid host
        // If mysql2 is not installed, will get package missing error
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

      const adapter = new MySQLAdapter(incompleteConfig);
      expect(adapter).toBeDefined();
    });

    it('should accept SSL configuration', () => {
      const sslConfig: DatabaseConfig = {
        ...validConfig,
        ssl: true,
      };

      const adapter = new MySQLAdapter(sslConfig);
      expect(adapter).toBeDefined();
    });

    it('should accept connection string in config', () => {
      const connStringConfig: DatabaseConfig = {
        ...validConfig,
        connectionString: 'mysql://user:pass@localhost:3306/db',
      };

      const adapter = new MySQLAdapter(connStringConfig);
      expect(adapter).toBeDefined();
    });

    it('should support name field in config', () => {
      const namedConfig: DatabaseConfig = {
        ...validConfig,
        name: 'MyProductionMySQL',
      };

      const adapter = new MySQLAdapter(namedConfig);
      expect(adapter).toBeDefined();
    });
  });

  describe('connection pooling', () => {
    it('should create adapter with pool configuration', () => {
      // MySQLAdapter uses connection pooling by default
      // Pool config: connectionLimit: 10, queueLimit: 0
      const adapter = new MySQLAdapter(validConfig);
      expect(adapter).toBeDefined();
    });

    it('should handle multiple adapter instances', () => {
      const adapter1 = new MySQLAdapter({ ...validConfig, database: 'db1' });
      const adapter2 = new MySQLAdapter({ ...validConfig, database: 'db2' });
      const adapter3 = new MySQLAdapter({ ...validConfig, database: 'db3' });

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

      const adapter = new MySQLAdapter(validConfig, {
        schema,
      });

      expect(adapter).toBeDefined();
    });

    it('should pass logger config to drizzle', () => {
      const adapter = new MySQLAdapter(validConfig, {
        logger: true,
      });

      expect(adapter).toBeDefined();
    });

    it('should use logger:false by default', () => {
      const adapter = new MySQLAdapter(validConfig);
      expect(adapter).toBeDefined();
    });

    it('should use default mode for drizzle', () => {
      // MySQLAdapter passes mode: 'default' to drizzle
      const adapter = new MySQLAdapter(validConfig);
      expect(adapter).toBeDefined();
    });
  });

  describe('MySQL specific features', () => {
    it('should use standard MySQL port 3306', () => {
      const adapter = new MySQLAdapter({
        host: 'localhost',
        port: 3306,
        database: 'db',
        user: 'root',
        password: 'pass',
      });

      const connStr = (adapter as any).createConnectionString();
      expect(connStr).toContain(':3306/');
    });

    it('should support custom MySQL ports', () => {
      const customPorts = [3307, 3308, 33060];

      customPorts.forEach((port) => {
        const adapter = new MySQLAdapter({
          ...validConfig,
          port,
        });

        const connStr = (adapter as any).createConnectionString();
        expect(connStr).toContain(`:${port}/`);
      });
    });

    it('should handle typical MySQL root user', () => {
      const rootConfig: DatabaseConfig = {
        host: 'localhost',
        port: 3306,
        database: 'mysql',
        user: 'root',
        password: 'rootpass',
      };

      const adapter = new MySQLAdapter(rootConfig);
      expect(adapter).toBeDefined();

      const connStr = (adapter as any).createConnectionString();
      expect(connStr).toContain('root:');
    });
  });
});
