---
'@asenajs/asena-drizzle': minor
---

Add @Transaction decorator and polish BaseRepository API.

**New: `@Transaction` and `@Drizzle` decorators for declarative transaction
boundaries.**

- `@Transaction` is a method-level decorator that wraps an async method so
  each call runs inside a Drizzle transaction. Propagation support:
  - `REQUIRED` (default): join an active transaction or start a new one.
  - `NESTED`: create a savepoint on the active transaction (via
    `tx.transaction()`), or start a new top-level transaction if none exists.
  - `REQUIRES_NEW`: always open a brand-new top-level transaction, suspending
    any outer one.
- `@Drizzle` activates the new `TransactionPostProcessor` by being applied to
  a user-side subclass placed inside the project's source folder (typically
  `src/config/AppDrizzle.ts`). AsenaJS only scans user source files, never
  `node_modules`, so this is the supported way to register the post-processor.
  Pass `defaultDb` to skip the `database` option on every `@Transaction` site
  in single-database projects.

Transaction propagation uses Node/Bun's native `AsyncLocalStorage`, so nested
repository calls automatically pick up the active transaction via an
ALS-aware `BaseRepository#db` getter — no explicit `tx` plumbing needed.
`isolationLevel` and `accessMode` options are forwarded to Drizzle's transaction
config.

**New repository methods** (all non-breaking additions):

- `findBy(field, value)` — shortcut for `findAll(eq(table[field], value))`.
- `existsBy(field, value)` — shortcut for `exists(eq(table[field], value))`.
- `updateMany(where, data)` — semantic alias of `update(where, data)`.
- `deleteMany(where)` — semantic alias of `delete(where)`.
- `transaction(cb, options?)` — programmatic transaction API, ALS-aware
  (opens a savepoint when called from inside an existing `@Transaction`).

**Fixed: deterministic pagination.** `paginate()` now falls back to
`asc(table.id)` when no `orderBy` is supplied, so pages no longer interleave
rows on stores that do not guarantee insertion order.

**Improved: logger fallback chain.** `@Database` services now prefer the
AsenaJS `ServerLogger` over `console` when the user did not pass an explicit
logger. Resolved via DI in `@PostConstruct`, so it picks up whatever logger
the application registered (e.g. `@asenajs/asena-logger`).

No breaking changes. Existing `@Database` / `@Repository` usage works
unmodified. Auto-resolution of `databaseService` when only one `@Database`
service is registered is planned for v1.3.0 once AsenaJS core ships an
`afterAllComponentsRegistered` post-processor hook (see
`docs/asena-core-feature-request-afterAllComponentsRegistered.md`).