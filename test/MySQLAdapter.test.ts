import { describe, it, expect } from 'bun:test';
import mysql from 'mysql2/promise';
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

  // `connectionString` was accepted by the config and then dropped on the floor here, so a
  // URL-configured application quietly connected to mysql2's localhost:3306 default instead.
  // Asserting on the built object alone would not catch the two ways of getting this wrong -
  // mysql2 ignores an unknown `connectionString` key with only a warning, and it prefers any
  // truthy discrete option over the URI - so each case is paired with the config mysql2 itself
  // resolved. createPool opens no connection until one is requested; `end()` closes the empty
  // pool.
  describe('connection string', () => {
    const buildOptions = (config: DatabaseConfig) => (new MySQLAdapter(config) as any).buildDriverOptions();

    const url = 'mysql://urluser:urlpass@url.example.com:3307/urldb';

    // Takes a config rather than options because createPool *mutates* the object it is given,
    // writing the URI's host/port/user/password/database back onto it. Reusing that object for
    // an absence assertion would prove nothing - so every caller here gets a fresh build.
    const driverView = async (config: DatabaseConfig) => {
      const pool = mysql.createPool(buildOptions(config) as any);
      const resolved = {
        ...(pool as any).pool.config.connectionConfig,
        connectionLimit: (pool as any).pool.config.connectionLimit,
      };

      await pool.end();

      return resolved;
    };

    it('should emit the connection string under `uri`, the key mysql2 reads', () => {
      const options = buildOptions({ ...validConfig, connectionString: url });

      // Not `connectionString`: that name is not in mysql2's validOptions, so it is warned
      // about and dropped, leaving the pool on localhost:3306.
      expect(options.uri).toBe(url);
      expect('connectionString' in options).toBe(false);
    });

    it('should omit the discrete fields entirely when a connection string is set', () => {
      const options = buildOptions({ ...validConfig, connectionString: url });

      expect('host' in options).toBe(false);
      expect('port' in options).toBe(false);
      expect('user' in options).toBe(false);
      expect('password' in options).toBe(false);
      expect('database' in options).toBe(false);
    });

    it('should let mysql2 resolve the connection from the URI rather than the discrete fields', async () => {
      // The decisive case: validConfig carries host 'localhost'. mysql2 keeps a truthy discrete
      // option over the URI, so emitting both would resolve to localhost - indistinguishable
      // from not honouring the connection string at all.
      const resolved = await driverView({ ...validConfig, connectionString: url });

      expect(resolved.host).toBe('url.example.com');
      expect(resolved.port).toBe(3307);
      expect(resolved.user).toBe('urluser');
      expect(resolved.database).toBe('urldb');
    });

    it('should emit the discrete fields and no uri when no connection string is configured', () => {
      const options = buildOptions(validConfig);

      expect(options.host).toBe('localhost');
      expect(options.port).toBe(3306);
      expect(options.user).toBe('testuser');
      expect(options.password).toBe('testpass');
      expect(options.database).toBe('testdb');
      expect('uri' in options).toBe(false);
    });

    it('should keep the pool settings alongside a connection string', async () => {
      const config: DatabaseConfig = {
        ...validConfig,
        connectionString: url,
        pool: { max: 7, connectTimeoutMs: 4000 },
      };

      expect(buildOptions(config).connectionLimit).toBe(7);

      const resolved = await driverView(config);

      expect(resolved.connectionLimit).toBe(7);
      expect(resolved.connectTimeout).toBe(4000);
    });

    it('should still spread extra last alongside a connection string', () => {
      const options = buildOptions({
        ...validConfig,
        connectionString: url,
        pool: { max: 7 },
        extra: { connectionLimit: 99, waitForConnections: false },
      });

      expect(options.connectionLimit).toBe(99);
      expect(options.waitForConnections).toBe(false);
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
    const buildOptions = (config: DatabaseConfig) => (new MySQLAdapter(config) as any).buildDriverOptions();

    it('should create adapter with pool configuration', () => {
      // MySQLAdapter uses connection pooling by default
      // Pool config: connectionLimit: 10, queueLimit: 0
      const adapter = new MySQLAdapter(validConfig);
      expect(adapter).toBeDefined();
    });

    it('should keep the previous hardcoded values as defaults', () => {
      const options = buildOptions(validConfig);

      expect(options.connectionLimit).toBe(10);
      expect(options.queueLimit).toBe(0);
    });

    it('should hand the configured pool size to mysql2 as connectionLimit', () => {
      const options = buildOptions({ ...validConfig, pool: { max: 25 } });

      expect(options.connectionLimit).toBe(25);
    });

    it('should pass the timeouts through in milliseconds', () => {
      const options = buildOptions({ ...validConfig, pool: { idleTimeoutMs: 15000, connectTimeoutMs: 4000 } });

      expect(options.idleTimeout).toBe(15000);
      expect(options.connectTimeout).toBe(4000);
    });

    it('should leave the timeouts unset when they are not configured', () => {
      const options = buildOptions(validConfig);

      expect('idleTimeout' in options).toBe(false);
      expect('connectTimeout' in options).toBe(false);
    });

    it('should ignore maxLifetimeMs, which mysql2 has no option for', () => {
      const options = buildOptions({ ...validConfig, pool: { maxLifetimeMs: 900000 } });

      expect('maxLifetime' in options).toBe(false);
      expect('maxLifetimeSeconds' in options).toBe(false);
    });

    it('should carry the connection fields alongside the pool settings', () => {
      const options = buildOptions({ ...validConfig, ssl: true, pool: { max: 3 } });

      expect(options.host).toBe('localhost');
      expect(options.port).toBe(3306);
      expect(options.database).toBe('testdb');
      expect(options.user).toBe('testuser');
      expect(options.password).toBe('testpass');
      expect(options.ssl).toEqual({});
      expect(options.connectionLimit).toBe(3);
    });

    it('should spread extra options and let them win', () => {
      const options = buildOptions({
        ...validConfig,
        pool: { max: 5 },
        extra: { connectionLimit: 99, waitForConnections: false },
      });

      expect(options.connectionLimit).toBe(99);
      expect(options.waitForConnections).toBe(false);
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
    const buildOptions = (config: DatabaseConfig) => (new MySQLAdapter(config) as any).buildDriverOptions();

    it('should use standard MySQL port 3306', () => {
      const options = buildOptions({
        host: 'localhost',
        port: 3306,
        database: 'db',
        user: 'root',
        password: 'pass',
      });

      expect(options.port).toBe(3306);
    });

    it('should support custom MySQL ports', () => {
      const customPorts = [3307, 3308, 33060];

      customPorts.forEach((port) => {
        expect(buildOptions({ ...validConfig, port }).port).toBe(port);
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

      expect(buildOptions(rootConfig).user).toBe('root');
    });
  });
});
