import { describe, expect, it } from 'bun:test';
import { SQL } from 'bun';
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

  // The suite above only ever asserted that an adapter could be constructed, never what the
  // adapter hands to Bun's SQL driver. That blind spot is why a hand-written five-key literal
  // could drop `ssl`, `connectionString` and the pool size without a single test noticing.
  //
  // Bun normalises and exposes its own options on the client, so these tests assert twice: on
  // the object the adapter builds, and on what the driver made of it. The second assertion is
  // the one that catches a plausible-looking but wrong key name - `idleTimeoutMillis` instead
  // of `idleTimeout` would simply never appear.
  describe('driver options', () => {
    const buildOptions = (config: DatabaseConfig) => (new BunSQLAdapter(config) as any).buildDriverOptions();

    const driverView = async (config: DatabaseConfig) => {
      const client = new SQL(buildOptions(config));
      const options = (client as any).options;

      // Nothing has connected - SQL is lazy - but close the handle anyway.
      await client.close();

      return options;
    };

    it('should pass the connection fields through', async () => {
      const options = await driverView(validConfig);

      expect(options.hostname).toBe('localhost');
      expect(options.port).toBe(5432);
      expect(options.database).toBe('testdb');
      expect(options.username).toBe('testuser');
      expect(options.password).toBe('testpass');
    });

    it('should pass the configured pool size to the driver', async () => {
      const options = await driverView({ ...validConfig, pool: { max: 42 } });

      expect(options.max).toBe(42);
    });

    it('should leave Bun defaults in place when no pool is configured', () => {
      const options = buildOptions(validConfig);

      // Absent, not `undefined`: an explicit key would overwrite Bun's own default.
      expect('max' in options).toBe(false);
      expect('idleTimeout' in options).toBe(false);
      expect('connectionTimeout' in options).toBe(false);
      expect('maxLifetime' in options).toBe(false);
    });

    it('should convert pool timeouts from milliseconds to the seconds Bun expects', async () => {
      const built = buildOptions({
        ...validConfig,
        pool: { idleTimeoutMs: 10000, connectTimeoutMs: 2500, maxLifetimeMs: 1800000 },
      });

      expect(built.idleTimeout).toBe(10);
      expect(built.connectionTimeout).toBe(2.5);
      expect(built.maxLifetime).toBe(1800);

      // Bun stores them back as milliseconds, which is the round trip that proves the unit
      // was right: a value passed in milliseconds would land a thousand times too large.
      const options = await driverView({
        ...validConfig,
        pool: { idleTimeoutMs: 10000, connectTimeoutMs: 2500, maxLifetimeMs: 1800000 },
      });

      expect(options.idleTimeout).toBe(10000);
      expect(options.connectionTimeout).toBe(2500);
      expect(options.maxLifetime).toBe(1800000);
    });

    it('should enable TLS when ssl is set', async () => {
      const options = await driverView({ ...validConfig, ssl: true });

      expect(options.tls).toBe(true);
    });

    it('should not force TLS off when ssl is omitted', () => {
      const options = buildOptions(validConfig);

      expect('tls' in options).toBe(false);
    });

    it('should use the connection string instead of the individual fields', async () => {
      const options = await driverView({
        ...validConfig,
        connectionString: 'postgresql://urluser:urlpass@url.example.com:5433/urldb',
      });

      expect(options.hostname).toBe('url.example.com');
      expect(options.port).toBe(5433);
      expect(options.database).toBe('urldb');
      expect(options.username).toBe('urluser');
    });

    it('should keep the pool settings when a connection string is used', async () => {
      const options = await driverView({
        ...validConfig,
        connectionString: 'postgresql://urluser:urlpass@url.example.com:5433/urldb',
        pool: { max: 7 },
      });

      expect(options.max).toBe(7);
    });

    it('should spread extra options into the driver options', () => {
      const options = buildOptions({ ...validConfig, extra: { bigint: true, prepare: false } });

      expect(options.bigint).toBe(true);
      expect(options.prepare).toBe(false);
    });

    it('should let extra win over everything the config produced', () => {
      const options = buildOptions({ ...validConfig, pool: { max: 5 }, extra: { max: 99 } });

      expect(options.max).toBe(99);
    });
  });
});
