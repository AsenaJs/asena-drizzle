# @asenajs/asena-drizzle

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
