# @asenajs/asena-drizzle

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
