import 'reflect-metadata';
import { defineMetadata, getOwnMetadata } from 'reflect-metadata/no-conflict';
import { TRANSACTION_METADATA_KEY, type TransactionOptions } from '../transaction/TransactionOptions';

/**
 * Marks a method as transactional. At bootstrap time the
 * {@link TransactionPostProcessor} reads this metadata and wraps the method so
 * every call runs inside a Drizzle transaction (see
 * {@link executeTransactional} for the propagation semantics).
 *
 * The decorator itself only records metadata — it does not change the method's
 * descriptor. This keeps `this` binding intact and lets the PostProcessor wrap
 * the fully constructed instance (after DI + @OnStart).
 *
 * @example
 * ```typescript
 * class UserService {
 *   @Inject('UserRepository') private userRepo!: UserRepository;
 *
 *   // Default: REQUIRED — join existing tx or start a new one.
 *   @Transaction()
 *   async register(dto: RegisterDto) {
 *     await this.userRepo.create(dto);
 *     await this.profileRepo.create(dto);
 *   }
 *
 *   // Savepoint: inner rollback does not discard the outer transaction.
 *   @Transaction({ propagation: 'NESTED' })
 *   async bestEffortAudit(userId: string) { ... }
 *
 *   // Independent transaction that survives an outer rollback.
 *   @Transaction({ propagation: 'REQUIRES_NEW', isolationLevel: 'serializable' })
 *   async writeAuditLog(event: Event) { ... }
 * }
 * ```
 *
 * Limitation: arrow-function class properties are not wrapped — use the
 * standard `async method()` syntax so the descriptor is present on the
 * prototype at bootstrap time.
 */
export function Transaction(options: TransactionOptions = {}): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const owner = (target as { constructor: Function }).constructor;
    const existing =
      (getOwnMetadata(TRANSACTION_METADATA_KEY, owner) as Map<string, TransactionOptions> | undefined) ??
      new Map<string, TransactionOptions>();

    existing.set(String(propertyKey), { propagation: 'REQUIRED', ...options });
    defineMetadata(TRANSACTION_METADATA_KEY, existing, owner);

    return descriptor;
  };
}

export type { TransactionOptions, Propagation } from '../transaction/TransactionOptions';
