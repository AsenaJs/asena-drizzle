---
'@asenajs/asena-drizzle': minor
---

Load only the configured database driver. A `bun-sql` application no longer evaluates drizzle's PostgreSQL and MySQL dialects, which kept the live heap larger and raised tail latency under load. The concrete adapter classes are exported from the package root as types only.
