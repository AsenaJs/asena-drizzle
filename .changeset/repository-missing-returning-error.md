---
"@asenajs/asena-drizzle": patch
---

With a `@Database` of `type: 'mysql'`, `BaseRepository.create`, `createMany`, `update`, `updateById`, `delete` and `deleteById`, and the `updateMany` and `deleteMany` aliases, reject with `Query builder does not support .returning() for this database driver` instead of a `TypeError` saying `returning is not a function`. Drizzle's MySQL query builders have no `.returning()`, so these methods do not work on `mysql`; the error names the missing method. `postgresql` and `bun-sql` databases are not affected.
