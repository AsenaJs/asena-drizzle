# @asenajs/asena-drizzle

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
