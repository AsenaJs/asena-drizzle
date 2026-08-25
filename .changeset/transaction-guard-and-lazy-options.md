---
"@asenajs/asena-drizzle": major
---

`@Database` now accepts a thunk (`@Database(() => ({ type: 'bun-sql', config: env.db }))`) whose options are evaluated when the container constructs the service — after module-level env reading — so a database service can be shipped from a shared package. A thunk cannot carry a `name`, so the thunk form registers under the decorated class's own name; the object form is unchanged.

Boot now fails loudly when a `@Transaction` method reached the container unwrapped: without a `TransactionPostProcessor` subclass in your source folder, or when a transactional class sits inside a post-processor's dependency closure, every `@Transaction` method used to run with autocommit — writes landed, tests passed, nothing was transactional. The boot now throws `@Transaction methods are not wrapped: <Class>.<method>` naming each unwrapped method instead of starting a half-configured application (when the only database service is itself a dependency of a post-processor, the check runs on the first `connection` read after registration instead of at start-up). This is a breaking behaviour for setups that relied on the silent no-op: an app without a `@Drizzle` subclass that previously booted will now fail to start.

`AsenaDatabaseService#connection` is transaction-aware: inside a `@Transaction` scope for that database it returns the active transaction, so hand-written writers join it instead of silently committing outside the transaction. A new `rootConnection` accessor always returns the pooled connection and is intended only for starting top-level transactions (internally used by `REQUIRES_NEW` and `BaseRepository#transaction`); reading `connection` outside a transaction still returns the pooled connection as before.

The error raised when `@Transaction()` is called without a `database` and no `defaultDb` is configured told you to set it on your `@DrizzleConfig` class — a decorator that does not exist. It now names `@Drizzle`, and so do the JSDoc examples on `TransactionPostProcessor`.
