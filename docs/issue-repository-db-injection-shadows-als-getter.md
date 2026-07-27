# Bug: `@Repository` decorator's `db` injection shadows the ALS-aware getter

**Severity:** High — silently breaks `@Transaction` rollback semantics in any project that uses repositories inside transactional methods.

**Affected versions:** v1.2.0+ (since the `@Transaction` feature shipped). Reproduced against current `main`.

**Affected adapters:** all (BunSQL adapter confirmed; the failure mode is at the repository layer, not the driver layer).

---

## Symptom

Repository writes inside a `@Transaction`-wrapped service method **do not roll back** when the method throws. They commit immediately as if no transaction is active.

The `@Transaction` decorator runs, the post-processor wraps the method, the Drizzle transaction is opened, ALS is set up correctly — but `userRepo.create(...)` still hits the pooled connection and persists rows.

The same applies to `repository.transaction()` (the programmatic API): if the user calls `repo.create(...)` from inside the callback instead of using the `tx` parameter directly, those writes commit even when the callback throws.

## Minimal reproduction

Standard project setup with `@Drizzle({ defaultDb: 'AppDatabase' })` post-processor, a `UserRepository` extending `BaseRepository`, and a transactional service:

```typescript
@Service()
export class TransactionalUserService {
  @Inject(UserRepository) private userRepo!: UserRepository;

  @Transaction()
  public async requiredRollback(payload: { users: User[]; failAfter: number }) {
    let inserted = 0;
    for (const u of payload.users) {
      await this.userRepo.create(u);   // <-- these writes do NOT roll back
      inserted++;
      if (inserted >= payload.failAfter) throw new Error('FAIL');
    }
  }
}
```

After calling `requiredRollback({ users: [A, B], failAfter: 2 })`:

- The method throws `FAIL` as expected.
- The Drizzle transaction is supposed to roll back.
- **Actual:** both rows A and B are present in `test_users`. Rollback never reached the writes.

## Root cause

`lib/decorators/Repository.ts` (compiled at `dist/lib/decorators/Repository.js:128`) installs an `@Inject` for the property name `'db'` on the wrapper class:

```ts
// asena-drizzle/lib/decorators/Repository.ts
const databaseServiceName = options.databaseService;
Inject(databaseServiceName, (service) => service.connection)(
  RepositoryServiceClass.prototype,
  'db',
);
```

At AsenaJS bootstrap, `Container#injectDependencies` reads this `@Inject` metadata and installs an **instance-level** property descriptor on every repository instance:

```js
// Asena/dist/lib/ioc/Container.js (paraphrased)
Object.defineProperty(newInstance, k, {
  get: () => instance,           // -> service.connection (the pooled Drizzle db)
  enumerable: true,
  configurable: true,
});
```

This instance-level `db` getter **completely shadows** the ALS-aware `db` getter defined on `BaseRepository.prototype`:

```ts
// lib/Repository.ts
public get db(): DatabaseConnection {
  if (this._databaseServiceName) {
    const activeTx = TransactionContext.getStore()
      ?.byDatabase.get(this._databaseServiceName);
    if (activeTx !== undefined) return activeTx as DatabaseConnection;
  }
  if (!this._db) throw new Error('...');
  return this._db;
}
```

Because property lookup walks the prototype chain *after* checking own properties, `repo.db` always returns the pooled connection. The prototype getter's ALS check is never executed at runtime.

## Verification

Bootstrapped a real e2e server (Hono adapter, Postgres on `localhost:5432`, BunSQL adapter), instrumented `repo.create` to dump ALS state at call time:

```
[repo.create] a@x.com  store? true  activeTx? true  this.db===tx? false
[repo.create] b@x.com  store? true  activeTx? true  this.db===tx? false
threw: REQUIRED_ROLLBACK_TRIGGER
Final rows: 2          // <-- both rows committed; rollback never reached the writes
```

Three confirmations:

- `store? true` — `TransactionContext.getStore()` returns a populated `TxStore`. ALS is wired up correctly by `runWithTx`.
- `activeTx? true` — `getActiveTx('AppDatabase')` returns the live Drizzle tx handle. The key matches `_databaseServiceName`.
- **`this.db===tx? false`** — yet `repo.db` does not return that tx. It returns the pool. The instance-level `@Inject`-installed getter wins over the prototype getter.

For comparison, the same Postgres + BunSQL setup correctly rolls back when the transaction handle is used directly (proving the driver layer is fine):

```
// raw drizzle, no asena-drizzle wrapping
await db.transaction(async (tx) => {
  await tx.insert(users).values(...);
  throw new Error('FORCE');
});
// rows after: 0    <-- rollback works
```

And the same `repo.transaction(async (tx) => { ...; throw })` rolls back **only when the callback uses `tx` directly**, not `repo.create`:

```
Test 1: repo.transaction(async (tx) => { tx.insert(...).values(...); throw })
   -> 0 rows  (rollback OK, tx used directly)

Test 2: repo.transaction(async (tx) => { repo.create(...); throw })
   -> 1 row   (rollback BROKEN, repo.create still hits the pool)
```

Both observations point at the same root cause: the instance-level `db` getter installed by `@Repository` is shadowing the ALS-aware getter on the prototype.

## Why existing tests don't catch this

`test/Transaction.test.ts` uses mocked transaction stubs and verifies the **propagation matrix structure** (which Drizzle call is made for REQUIRED / NESTED / REQUIRES_NEW). It does not run repository writes against a real database, so the shadowed getter never matters in those assertions.

`test/Repository.advanced.test.ts` exercises `repository.transaction()` but verifies only that the underlying `db.transaction()` is called with the right config — it does not verify rollback semantics for chained `repo.create` calls inside the callback.

The bug only surfaces in true e2e usage where:
1. A real `@Repository` instance is constructed via the AsenaJS IoC container (so the `@Inject('db')` runs).
2. A real Drizzle adapter (BunSQL / pg / mysql2) is connected.
3. A `@Transaction`-decorated method calls `repo.create/find/update/delete` (rather than using the `tx` parameter directly).

All three are required. Unit tests with hand-constructed repository instances skip step 1 and never hit the bug.

## Suggested fixes

In rough preference order:

### Option A — drop the `@Inject` for `'db'`; keep the prototype getter authoritative (recommended)

Remove the line in `lib/decorators/Repository.ts`:

```diff
- const databaseServiceName = options.databaseService;
- Inject(databaseServiceName, (service) => service.connection)(
-   RepositoryServiceClass.prototype,
-   'db',
- );
+ // Connection is now resolved lazily by BaseRepository#db getter using
+ // the database service name set above. We still need to inject the
+ // raw database service so the getter can look it up — see below.
```

…and have the decorator inject the database **service** (not its connection) into a private field instead, then have the prototype getter resolve `this._dbService.connection` (or pull from ALS first). This keeps a single source of truth in `BaseRepository` and the ALS branch always runs.

### Option B — make the injected getter ALS-aware

Change the `Inject` callback so the value it returns checks ALS before returning the connection:

```ts
Inject(databaseServiceName, (service) => {
  // Return a Proxy / accessor that defers to ALS first, then service.connection.
  // This is the bare minimum to unblock @Transaction without restructuring
  // the decorator.
})(RepositoryServiceClass.prototype, 'db');
```

This works but spreads ALS knowledge into the decorator and creates a per-instance Proxy on the hot path.

### Option C — inject onto `_db` instead of `db`

Change the inject target so it populates the private backing field, leaving the prototype `db` getter visible:

```diff
- Inject(databaseServiceName, (service) => service.connection)(
-   RepositoryServiceClass.prototype,
-   'db',
- );
+ Inject(databaseServiceName, (service) => service.connection)(
+   RepositoryServiceClass.prototype,
+   '_db',     // <-- the BaseRepository setter for `db` writes here too
+ );
```

This is the smallest diff. Verify that AsenaJS's `Container#injectDependencies` is happy installing a property whose name starts with `_` (it should be — the underscore is just a naming convention).

## Required regression test (whichever fix is chosen)

The unit-test gap should be closed too. Add an integration test that:

1. Boots a minimal AsenaJS server with `@Database`, `@Repository`, `@Drizzle`, and a `@Transaction`-wrapped service.
2. Connects to a real Postgres (or sqlite/in-memory if a faster harness is desired).
3. Calls a method that does `repo.create(...)` then throws.
4. Asserts the row is **absent** from the table afterward.

Same shape for `repo.transaction(async (tx) => { repo.create(...); throw })` — must roll back.

If those two assertions had existed, this bug would have been caught at v1.2.0 release time.

## Discovery context

Surfaced while writing e2e transaction tests for `asena-drizzle` v1.2.x in the AsenaJS monorepo's `asena-test-hono` project. 6 of 12 transaction scenarios fail consistently with the same signature: rollback expected, rows persisted. All 6 share the property "the test relies on `repo.<method>` writes inside a `@Transaction` rolling back". The 6 that pass are either (a) happy-path commits, (b) isolation-level forwarding (which doesn't depend on rollback), or (c) the one programmatic test that uses `tx` directly.

Once Option A/B/C is applied, the e2e suite should go green without any test changes.
