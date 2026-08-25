# @asenajs/asena-drizzle

## 4.0.0

### Major Changes

- 35f0298: Requires `@asenajs/asena` `^0.11.0` as the peer dependency and Bun 1.4. Core 0.10.x is outside the peer range.
- c653aa1: `@Database` now accepts a thunk (`@Database(() => ({ type: 'bun-sql', config: env.db }))`) whose options are evaluated when the container constructs the service — after module-level env reading — so a database service can be shipped from a shared package. A thunk cannot carry a `name`, so the thunk form registers under the decorated class's own name; the object form is unchanged.

  Boot now fails loudly when a `@Transaction` method reached the container unwrapped: without a `TransactionPostProcessor` subclass in your source folder, or when a transactional class sits inside a post-processor's dependency closure, every `@Transaction` method used to run with autocommit — writes landed, tests passed, nothing was transactional. The boot now throws `@Transaction methods are not wrapped: <Class>.<method>` naming each unwrapped method instead of starting a half-configured application (when the only database service is itself a dependency of a post-processor, the check runs on the first `connection` read after registration instead of at start-up). This is a breaking behaviour for setups that relied on the silent no-op: an app without a `@Drizzle` subclass that previously booted will now fail to start.

  `AsenaDatabaseService#connection` is transaction-aware: inside a `@Transaction` scope for that database it returns the active transaction, so hand-written writers join it instead of silently committing outside the transaction. A new `rootConnection` accessor always returns the pooled connection and is intended only for starting top-level transactions (internally used by `REQUIRES_NEW` and `BaseRepository#transaction`); reading `connection` outside a transaction still returns the pooled connection as before.

  The error raised when `@Transaction()` is called without a `database` and no `defaultDb` is configured told you to set it on your `@DrizzleConfig` class — a decorator that does not exist. It now names `@Drizzle`, and so do the JSDoc examples on `TransactionPostProcessor`.

## 3.0.0

### Major Changes

- The pool is released on shutdown, and its size is finally configurable

  Nothing in the framework ever called `AsenaDatabaseService.disconnect()`. A downstream team ran
  integration tests where every file builds a container in `beforeAll` and calls `app.stop()` in
  `afterAll`; the pools accumulated for the whole run until Postgres answered
  `sorry, too many clients already`. The failure landed in whichever file happened to run last, so
  it read as _that_ file being broken, and it moved when the file order changed. `@OnStop` now
  closes the adapter on `server.stop()`.

  `@PostConstruct` on `onStart()` becomes `@OnStart` — the same metadata key, renamed with core.

  **Pool sizing.** The same team set `max` in the `@Database` config and saw no effect: `max` was
  not a field on `DatabaseConfig` at all, and no adapter spread the user's config — each wrote an
  explicit key literal, so anything outside it was unreachable. `DatabaseConfig` now takes:

  ```ts
  pool?: { max?: number; idleTimeoutMs?: number; connectTimeoutMs?: number; maxLifetimeMs?: number }
  extra?: Record<string, unknown>   // spread last into the driver options
  ```

  mapped per driver to that driver's own option names. The previously hardcoded values became the
  defaults, so configuring nothing behaves exactly as before. `bun-sql` additionally now honours
  `ssl`, which it had been dropping alongside `connectionString` and the pool size.

  **Breaking:** requires `@asenajs/asena@^0.10.0`. A 0.9.x application cannot use this version.

- `connectionString` is honoured by every adapter, and `createConnectionString()` is gone

  `config.connectionString` was accepted by `DatabaseConfig` and documented as supported, but only
  `bun-sql` ever read it. The `postgresql` and `mysql` adapters built their driver options from the
  five discrete fields alone, so a URL-configured application connected somewhere else entirely:
  pg fell through to `PGHOST`/`PGUSER` and the OS username, mysql2 to `localhost:3306`. The README's
  own example (`connectionString` alongside `host: '', port: 0, database: '', user: '', password: ''`)
  could not connect at all.

  Each adapter now emits the connection string under its own driver's key (`connectionString` for
  `postgresql`, `uri` for `mysql`, `url` for `bun-sql`) and emits **none** of `host`, `port`,
  `database`, `user`, `password` when it is set. `ssl`, `pool` and `extra` are unaffected and still
  apply.

  The five fields are not merged into the URL because no merge exists to implement, and the drivers
  disagree on which side wins: pg parses the URL over the whole option object and fills whatever the
  URL omits from its own defaults (`{ port: 5555, connectionString: 'postgres://u:p@h/db' }` resolves
  to 5432, never 5555), while mysql2 keeps any truthy discrete option and ignores the URI. Emitting
  both would have meant a different winner per database type.

  ## Breaking: the five discrete fields are now optional

  `host`, `port`, `database`, `user` and `password` on `DatabaseConfig` are optional. A
  connection-string config no longer has to blank them out to satisfy the type, and pg's "configure
  it through `PGHOST`/`PGUSER`" case is expressible for the first time. Existing configs keep
  compiling; anything reading `DatabaseConfig` and assuming the fields are present will not.

  ## Breaking: `createConnectionString()` is removed

  The `protected createConnectionString()` on `DatabaseAdapter`, `PostgreSQLAdapter` and
  `MySQLAdapter` is gone. It had no production caller left - every adapter builds its driver options
  directly - and its synthesis branch was broken anyway: it never URL-encoded credentials, so a
  password like `p@ss:w0rd!` produced a corrupt URL. `DatabaseAdapter` is exported from the package
  root, so a subclass that called it will no longer compile.

## 2.0.0

### Major Changes

- `@Repository` and `@Database` keep everything the decorated class inherited, and stop clobbering
  their own metadata

  Both decorators replace the class they decorate with a wrapper. The wrapper extended
  `BaseRepository`/`AsenaDatabaseService` rather than the target, and the member copy loops only
  walked the target's _own_ prototype — so every method, getter and static the class inherited from
  an intermediate base class was dropped. Nothing failed until the first call, where the method was
  simply `undefined`. `instanceof` against the declared base class was also false.

  The wrapper now extends the target, so the whole prototype chain is preserved and `instanceof`
  holds.

  The comment this replaced said the wrapper existed to keep the original class out of the
  dependency chain. The real problem was in the container: the wrapper is registered under the
  target's own name, and `IocEngine.getDependencies` counted the parent as a dependency, so the
  component depended on itself and a circular dependency was reported. That is fixed in
  `@asenajs/asena` — **which must be published first**, and the peer range has been bumped
  accordingly.

  ## Breaking: the metadata copy loops are gone, and they were destroying data

  Both wrappers copied every metadata key off the target onto themselves. `getMetadataKeys` walks
  the prototype chain while `getMetadata` returns only the nearest value, so the loop flattened
  inherited records onto the wrapper as _own_ properties — and it ran _after_ the wrapper had
  written its own. Two concrete failures, neither visible to the existing tests because
  `BaseRepository` declares no decorators of its own:

  1. **`@Repository` destroyed its own `_db` injection** the moment the repository declared any
     `@Inject` of its own. The wrapper's `DependencyKey` (`{ _db }`) was overwritten by the
     target's, so `_db` was never injected and the first query threw _"Database connection not
     initialized. Make sure @Repository decorator is applied properly"_ — a message pointing at the
     decorator rather than at the cause.
  2. **A decorated class extending another decorated class registered under its parent's name.** An
     inherited `NameKey` was copied over the wrapper's own, so two `@Database` services both
     registered as the first one's name; the container promoted the entry to an array, and
     `TransactionPostProcessor` took `registry[0]` — committing transactions against the wrong
     database, silently. `@Transaction({ database: 'X' })` for the shadowed name threw at boot.

  Nothing needs copying now: the wrapper extends the target, so everything is reachable through
  the prototype chain and every reader walks it.

  ## `@Transaction` on a base class now runs inside a transaction

  `TransactionPostProcessor` read the transactional-method map with own-metadata off the registered
  class, and the map only reached the wrapper through the copy loop above — which is nearest-wins.
  So a base class's `@Transaction` methods worked right up until the concrete class declared one of
  its own, at which point the base's map was shadowed and its methods quietly ran with autocommit.
  Each write committed on its own, a mid-method failure left partial rows, and the method returned
  normally. The map is now merged across the prototype chain.

  `@Database`'s type parameter is now constrained to `AsenaDatabaseService`. Decorating a class
  that does not extend it used to work by accident, because the wrapper supplied the service
  surface; it now fails to compile rather than at the first request.

  Requires `@asenajs/asena` 0.9.0 or later.

## 1.2.0

### Minor Changes

- 80a7d40: Add @Transaction decorator and polish BaseRepository API.

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

## 1.1.2

### Patch Changes

- ### Fixes
  - **Pagination Validation**: `paginate()` now clamps `page` and `limit` parameters to a minimum of 1, preventing invalid offset/limit values in database queries.

  ### Dependencies
  - `drizzle-orm`: 0.44.7 -> 0.45.2
  - `mysql2`: 3.20.0 -> 3.22.0
  - `prettier`: 3.8.1 -> 3.8.2
  - `typescript-eslint`: 8.58.0 -> 8.58.1

  ### Tests
  - Rewrote pagination test suite with reusable helpers.
  - Added tests: empty results, page clamping, limit clamping, where/orderBy propagation.

## 1.1.1

### Patch Changes

- Missleading lockfile changed to correct one

## 1.1.0

### Minor Changes

- ### Import Path Migration
  - `@asenajs/asena/server` → `@asenajs/asena/decorators` (Database.ts, Repository.ts)
  - `@asenajs/asena/ioc` → `@asenajs/asena/decorators/ioc` (DatabaseService.ts, Repository.ts)
  - README examples updated to reflect new import paths

  ### Configuration
  - Changeset baseBranch corrected from `main` to `master`
  - Coverage path ignore patterns added to bunfig.toml

  ### Dependency Updates
  - `@asenajs/asena` `0.5.0` → `^0.7.0` (dev + peer)
  - `drizzle-kit` `^0.31.5` → `^0.31.10`
  - `@types/pg` `^8.15.5` → `^8.20.0`
  - `pg` `^8.16.3` → `^8.20.0`
  - `mysql2` `^3.15.3` → `^3.20.0`
  - `eslint` `^9.38.0` → `^9.39.4`
  - `prettier` `^3.6.2` → `^3.8.1`
  - `typescript-eslint` `^8.46.2` → `^8.58.0`

## 1.0.2

### Patch Changes

- 23b315b: test: add comprehensive unit test suite
  - Add 140+ unit tests across all core modules

- 23b315b: chore: migrate to ESLint v9 flat config
  - Update ESLint from v8.57 to v9.38
  - Update @typescript-eslint packages to v8.46
  - Replace deprecated .eslintrc with flat config (eslint.config.cjs)
  - Add Prettier v3.6 integration
  - Remove deprecated .eslintignore file
  - Add new lint and format scripts to package.json

## 1.0.1

### Patch Changes

- Fix decorator class name export for asena-cli build compatibility

  Fixed an issue where `@Database` and `@Repository` decorators were exporting internal class names (`DatabaseServiceClass` and `RepositoryServiceClass`) instead of the original decorated class names. This caused build failures when using `asena build` command with errors like "No matching export for import".

  The decorators now use `Object.defineProperty` to override the class name property, ensuring the exported class name matches the original class name that the CLI expects during the build process.

  **Breaking Changes:** None
  **Migration Required:** No - this is a transparent fix

  **Technical Details:**
  - Added `Object.defineProperty` call to override `name` property after metadata copying
  - Affects both `@Database` and `@Repository` decorators
  - Maintains backward compatibility with existing code
