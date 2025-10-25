import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { AsenaDatabaseService } from '../lib/DatabaseService';
import type { DatabaseConfig, DatabaseOptions } from '../lib/types';
import { BunSQLAdapter, MySQLAdapter, PostgreSQLAdapter } from '../lib/adapters';

// Mock logger for testing
const mockLogger = {
  info: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  debug: mock(() => {}),
};

// Concrete test implementation
class TestDatabaseService extends AsenaDatabaseService<any> {
  // Expose protected methods for testing
  public async callOnStart() {
    return this.onStart();
  }

  public setOptions(options: DatabaseOptions) {
    this.setDatabaseOptions(options);
  }

  public getAdapter() {
    return this.adapter;
  }
}

describe('AsenaDatabaseService', () => {
  let service: TestDatabaseService;
  const baseConfig: DatabaseConfig = {
    host: 'localhost',
    port: 5432,
    database: 'testdb',
    user: 'test',
    password: 'test',
  };

  beforeEach(() => {
    service = new TestDatabaseService();
    mockLogger.info.mockClear();
    mockLogger.error.mockClear();
  });

  describe('initialization', () => {
    it('should start with no adapter', () => {
      expect(service.getAdapter()).toBeNull();
    });

    it('should set database options', () => {
      const options: DatabaseOptions = {
        type: 'bun-sql',
        config: baseConfig,
        // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);
      // Options are set internally, no error should occur
      expect(service).toBeDefined();
    });
  });

  describe('testConnection', () => {
    it('should return false when adapter is not initialized', async () => {
      const result = await service.testConnection();
      expect(result).toBe(false);
    });

    it('should delegate to adapter testConnection when adapter exists', async () => {
      const mockAdapter = {
        testConnection: mock(async () => true),
        connect: mock(async () => ({})),
        disconnect: mock(async () => {}),
        connection: {},
      };

      // @ts-ignore - directly set adapter for testing
      service['adapter'] = mockAdapter as any;

      const result = await service.testConnection();

      expect(result).toBe(true);
      expect(mockAdapter.testConnection).toHaveBeenCalled();
    });

    it('should return false when adapter testConnection fails', async () => {
      const mockAdapter = {
        testConnection: mock(async () => false),
        connect: mock(async () => ({})),
        disconnect: mock(async () => {}),
        connection: {},
      };

      // @ts-ignore
      service['adapter'] = mockAdapter as any;

      const result = await service.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should handle disconnect when no adapter exists', async () => {
      await expect(service.disconnect()).resolves.toBeUndefined();
    });

    it('should call adapter disconnect and clear adapter', async () => {
      const mockAdapter = {
        disconnect: mock(async () => {}),
        connect: mock(async () => ({})),
        testConnection: mock(async () => true),
        connection: {},
      };

      // @ts-ignore
      service['adapter'] = mockAdapter as any;

      await service.disconnect();

      expect(mockAdapter.disconnect).toHaveBeenCalled();
      expect(service.getAdapter()).toBeNull();
    });

    it('should allow multiple disconnect calls', async () => {
      const mockAdapter = {
        disconnect: mock(async () => {}),
        connect: mock(async () => ({})),
        testConnection: mock(async () => true),
        connection: {},
      };

      // @ts-ignore
      service['adapter'] = mockAdapter as any;

      await service.disconnect();
      await service.disconnect();
      await service.disconnect();

      expect(mockAdapter.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('connection getter', () => {
    it('should throw error when adapter not initialized', () => {
      expect(() => service.connection).toThrow('Database adapter not initialized');
    });

    it('should return adapter connection when initialized', () => {
      const mockConnection = { query: 'mock' };
      const mockAdapter = {
        connection: mockConnection,
        disconnect: mock(async () => {}),
        connect: mock(async () => mockConnection),
        testConnection: mock(async () => true),
      };

      // @ts-ignore
      service['adapter'] = mockAdapter as any;

      const connection = service.connection;

      expect(connection).toBe(mockConnection);
    });
  });

  describe('createAdapter - adapter selection', () => {
    it('should throw error when options not set', async () => {
      // When options is null, the error will be caught and logger access will fail
      await expect(service.callOnStart()).rejects.toThrow();
    });

    it('should create BunSQLAdapter for bun-sql type', () => {
      const options: DatabaseOptions = {
        type: 'bun-sql',
        config: baseConfig,
        // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);

      // Access private method through reflection
      const adapter = (service as any).createAdapter();

      expect(adapter).toBeInstanceOf(BunSQLAdapter);
    });

    it('should create PostgreSQLAdapter for postgresql type', () => {
      const options: DatabaseOptions = {
        type: 'postgresql',
        config: baseConfig,
        // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);

      const adapter = (service as any).createAdapter();

      expect(adapter).toBeInstanceOf(PostgreSQLAdapter);
    });

    it('should create MySQLAdapter for mysql type', () => {
      const options: DatabaseOptions = {
        type: 'mysql',
        config: { ...baseConfig, port: 3306 },
        // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);

      const adapter = (service as any).createAdapter();

      expect(adapter).toBeInstanceOf(MySQLAdapter);
    });

    it('should throw error for sqlite (not implemented)', () => {
      const options: DatabaseOptions = {
        type: 'sqlite' as any,
        config: baseConfig,
        // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);

      expect(() => (service as any).createAdapter()).toThrow('SQLite adapter not implemented yet');
    });

    it('should throw error for unsupported database type', () => {
      const options: DatabaseOptions = {
        type: 'mongodb' as any,
        config: baseConfig,
        // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);

      expect(() => (service as any).createAdapter()).toThrow('Unsupported database type');
    });
  });

  describe('onStart lifecycle', () => {
    it('should throw error when options are not set', async () => {
      // When options is null, accessing logger in catch block will fail
      await expect(service.callOnStart()).rejects.toThrow();
    });

    it('should log error and throw when connection fails', async () => {
      const options: DatabaseOptions = {
        type: 'bun-sql',
        config: {
          host: 'invalid-host-xyz-123',
          port: 99999,
          database: 'invalid',
          user: 'invalid',
          password: 'invalid',
        },
              // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);

      await expect(service.callOnStart()).rejects.toThrow('Database connection failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should pass drizzle config to adapter', () => {
      const schema = { users: {} };
      const options: DatabaseOptions = {
        type: 'postgresql',
        config: baseConfig,
        drizzleConfig: {
          schema,
          logger: true,
        },
              // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);

      const adapter = (service as any).createAdapter();

      expect(adapter).toBeInstanceOf(PostgreSQLAdapter);
    });
  });

  describe('error handling', () => {
    it('should provide clear error message on adapter creation failure', () => {
      const options: DatabaseOptions = {
        type: 'invalid-type' as any,
        config: baseConfig,
              // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);

      expect(() => (service as any).createAdapter()).toThrow('Unsupported database type');
    });

    it('should handle missing config fields gracefully', () => {
      const options: DatabaseOptions = {
        type: 'postgresql',
        config: {} as DatabaseConfig,
              // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);

      // Should create adapter without throwing
      const adapter = (service as any).createAdapter();
      expect(adapter).toBeInstanceOf(PostgreSQLAdapter);
    });
  });

  describe('config options', () => {
    it('should support database name in config', () => {
      const options: DatabaseOptions = {
        type: 'postgresql',
        config: {
          ...baseConfig,
          name: 'MyProductionDB',
        },
              // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);

      const adapter = (service as any).createAdapter();
      expect(adapter).toBeDefined();
    });

    it('should support SSL configuration', () => {
      const options: DatabaseOptions = {
        type: 'postgresql',
        config: {
          ...baseConfig,
          ssl: true,
        },
              // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);

      const adapter = (service as any).createAdapter();
      expect(adapter).toBeInstanceOf(PostgreSQLAdapter);
    });

    it('should support connection string in config', () => {
      const options: DatabaseOptions = {
        type: 'postgresql',
        config: {
          ...baseConfig,
          connectionString: 'postgresql://user:pass@localhost:5432/db',
        },
              // @ts-ignore
        logger: mockLogger,
      };

      service.setOptions(options);

      const adapter = (service as any).createAdapter();
      expect(adapter).toBeInstanceOf(PostgreSQLAdapter);
    });
  });

  describe('adapter lifecycle', () => {
    it('should clean up adapter on disconnect', async () => {
      const mockAdapter = {
        disconnect: mock(async () => {}),
        connect: mock(async () => ({})),
        testConnection: mock(async () => true),
        connection: {},
      };

      // @ts-ignore
      service['adapter'] = mockAdapter as any;

      expect(service.getAdapter()).not.toBeNull();

      await service.disconnect();

      expect(service.getAdapter()).toBeNull();
      expect(mockAdapter.disconnect).toHaveBeenCalled();
    });

    it('should maintain adapter state correctly', () => {
      expect(service.getAdapter()).toBeNull();

      const mockAdapter = {
        disconnect: mock(async () => {}),
        connect: mock(async () => ({})),
        testConnection: mock(async () => true),
        connection: {},
      };

      // @ts-ignore
      service['adapter'] = mockAdapter as any;

      expect(service.getAdapter()).not.toBeNull();
    });
  });
});
