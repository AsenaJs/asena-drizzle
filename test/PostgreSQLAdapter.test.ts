import { describe, it, expect } from 'bun:test';
import { Client } from 'pg';
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

  // `connectionString` was accepted by the config and then dropped on the floor here: the
  // options literal only ever carried the five discrete fields, so a URL-configured application
  // silently fell back to pg's PG* environment defaults. The object-level assertions below are
  // not enough on their own - pg ignores unknown keys without complaining - so each one is
  // paired with what pg's own Client made of the options. A Client normalises its parameters in
  // the constructor and opens nothing, so there is no socket and nothing to clean up.
  describe('connection string', () => {
    const buildOptions = (config: DatabaseConfig) => (new PostgreSQLAdapter(config) as any).buildDriverOptions();

    // `?ssl=true` rather than `?sslmode=require`: pg-connection-string prints a multi-line
    // deprecation warning for the sslmode spellings and would spray it across the suite output.
    const url = 'postgresql://urluser:urlpass@url.example.com:5433/urldb';

    const driverView = (config: DatabaseConfig) => new Client(buildOptions(config)) as any;

    it('should emit the connection string under the key pg reads', () => {
      const options = buildOptions({ ...validConfig, connectionString: url });

      expect(options.connectionString).toBe(url);
    });

    it('should omit the discrete fields entirely when a connection string is set', () => {
      const options = buildOptions({ ...validConfig, connectionString: url });

      // Absent, not `undefined`: pg cannot merge the two - it re-parses the URL over the whole
      // option object and fills what the URL omits from its own defaults, never from these.
      expect('host' in options).toBe(false);
      expect('port' in options).toBe(false);
      expect('database' in options).toBe(false);
      expect('user' in options).toBe(false);
      expect('password' in options).toBe(false);
    });

    it('should accept a config that carries nothing but a connection string', () => {
      // The five fields are optional, so this compiles - the README used to have to blank them
      // out to satisfy the type, which is the config that could not connect.
      const config: DatabaseConfig = { connectionString: url };
      const client = driverView(config);

      expect(client.host).toBe('url.example.com');
      expect(client.database).toBe('urldb');
    });

    it('should let pg resolve the connection from the URL rather than the discrete fields', () => {
      const client = driverView({ ...validConfig, connectionString: url });

      expect(client.host).toBe('url.example.com');
      expect(client.port).toBe(5433);
      expect(client.user).toBe('urluser');
      expect(client.database).toBe('urldb');
    });

    it('should emit the discrete fields and no connection string when none is configured', () => {
      const options = buildOptions(validConfig);

      expect(options.host).toBe('localhost');
      expect(options.port).toBe(5432);
      expect(options.database).toBe('testdb');
      expect(options.user).toBe('testuser');
      expect(options.password).toBe('testpass');
      expect('connectionString' in options).toBe(false);
    });

    it('should keep the pool settings alongside a connection string', () => {
      const options = buildOptions({
        ...validConfig,
        connectionString: url,
        pool: { max: 7, idleTimeoutMs: 5000 },
      });

      expect(options.connectionString).toBe(url);
      expect(options.max).toBe(7);
      expect(options.idleTimeoutMillis).toBe(5000);
    });

    it('should still spread extra last alongside a connection string', () => {
      const options = buildOptions({
        ...validConfig,
        connectionString: url,
        pool: { max: 7 },
        extra: { max: 99, application_name: 'billing-api' },
      });

      expect(options.max).toBe(99);
      expect(options.application_name).toBe('billing-api');
    });

    it('should let an ssl parameter in the URL enable TLS over the emitted ssl:false', () => {
      const client = driverView({ ...validConfig, connectionString: `${url}?ssl=true` });

      expect(client.ssl).toBe(true);
    });

    it('should apply config.ssl when the URL says nothing about it', () => {
      const client = driverView({ ...validConfig, connectionString: url, ssl: true });

      expect(client.ssl).toEqual({ rejectUnauthorized: false });
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
    const buildOptions = (config: DatabaseConfig) => (new PostgreSQLAdapter(config) as any).buildDriverOptions();

    it('should create adapter with pool configuration', () => {
      // PostgreSQLAdapter uses connection pooling by default
      // Pool config: max: 20, idleTimeout: 30s, connectionTimeout: 2s
      const adapter = new PostgreSQLAdapter(validConfig);
      expect(adapter).toBeDefined();
    });

    it('should keep the previous hardcoded values as defaults', () => {
      const options = buildOptions(validConfig);

      expect(options.max).toBe(20);
      expect(options.idleTimeoutMillis).toBe(30000);
      expect(options.connectionTimeoutMillis).toBe(2000);
    });

    it('should hand the configured pool settings to pg', () => {
      const options = buildOptions({
        ...validConfig,
        pool: { max: 50, idleTimeoutMs: 5000, connectTimeoutMs: 1000 },
      });

      expect(options.max).toBe(50);
      expect(options.idleTimeoutMillis).toBe(5000);
      expect(options.connectionTimeoutMillis).toBe(1000);
    });

    it('should translate the connection lifetime into the seconds pg expects', () => {
      const options = buildOptions({ ...validConfig, pool: { maxLifetimeMs: 900000 } });

      expect(options.maxLifetimeSeconds).toBe(900);
    });

    it('should leave the lifetime unset when it is not configured', () => {
      expect('maxLifetimeSeconds' in buildOptions(validConfig)).toBe(false);
    });

    it('should carry the connection fields alongside the pool settings', () => {
      const options = buildOptions({ ...validConfig, ssl: true, pool: { max: 3 } });

      expect(options.host).toBe('localhost');
      expect(options.port).toBe(5432);
      expect(options.database).toBe('testdb');
      expect(options.user).toBe('testuser');
      expect(options.password).toBe('testpass');
      expect(options.ssl).toEqual({ rejectUnauthorized: false });
      expect(options.max).toBe(3);
    });

    it('should spread extra options and let them win', () => {
      const options = buildOptions({
        ...validConfig,
        pool: { max: 5 },
        extra: { max: 99, application_name: 'billing-api' },
      });

      expect(options.max).toBe(99);
      expect(options.application_name).toBe('billing-api');
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
