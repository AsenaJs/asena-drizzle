import 'reflect-metadata';
import { Service } from '@asenajs/asena/server';
import type { DatabaseOptions } from '../types';
import { AsenaDatabaseService } from '../DatabaseService';

export interface DatabaseDecoratorOptions extends DatabaseOptions {
  name?: string;
}

export function Database(options: DatabaseDecoratorOptions) {
  return function <T extends new (...args: any[]) => any>(target: T) {
    // Apply @Service decorator
    Service(options.name)(target);

    // Create a new class that extends the target and AsenaDatabaseService
    class DatabaseServiceClass extends AsenaDatabaseService {

      public constructor(...args: any[]) {
        super(options);

        // If target has its own constructor logic, call it
        if (target.prototype.constructor !== Object.prototype.constructor) {
          // eslint-disable-next-line new-cap
          const instance = new target(...args);

          Object.assign(this, instance);
        }
      }
    
}

    // Copy prototype methods and properties
    Object.getOwnPropertyNames(target.prototype).forEach((name) => {
      if (name !== 'constructor') {
        const descriptor = Object.getOwnPropertyDescriptor(target.prototype, name);

        if (descriptor) {
          Object.defineProperty(DatabaseServiceClass.prototype, name, descriptor);
        }
      }
    });

    // Copy static methods and properties
    Object.getOwnPropertyNames(target).forEach((name) => {
      if (name !== 'prototype' && name !== 'name' && name !== 'length') {
        const descriptor = Object.getOwnPropertyDescriptor(target, name);

        if (descriptor) {
          Object.defineProperty(DatabaseServiceClass, name, descriptor);
        }
      }
    });

    // Copy metadata
    const metadata = Reflect.getMetadataKeys(target);

    metadata.forEach((key) => {
      const value = Reflect.getMetadata(key, target);

      Reflect.defineMetadata(key, value, DatabaseServiceClass);
    });

    // Set name for better debugging
    Object.defineProperty(DatabaseServiceClass, 'name', {
      value: target.name || 'DatabaseService',
    });

    return DatabaseServiceClass as any;
  };
}
