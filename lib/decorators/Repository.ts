import 'reflect-metadata';
import { Service } from '@asenajs/asena/server';
import { Inject } from '@asenajs/asena/ioc';
import type { Table } from 'drizzle-orm';

export interface RepositoryDecoratorOptions {
  table: Table;
  databaseService?: string; // Name of the database service to inject
  name?: string; // Service name
}

export function Repository(options: RepositoryDecoratorOptions) {
  return function <T extends new (...args: any[]) => any>(target: T) {
    // Apply @Service decorator
    Service(options.name)(target);

    // Add database injection
    const databaseServiceName = options.databaseService || 'DatabaseService';

    // Add table property
    Object.defineProperty(target.prototype, 'table', {
      value: options.table,
      writable: false,
      enumerable: true,
      configurable: false,
    });

    // Add database injection via decorator
    Inject(databaseServiceName, (service: any) => service.connection)(target.prototype, 'db');

    return target;
  };
}
