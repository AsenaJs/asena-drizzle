import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

// A fresh process per case: the test runner's own module registry already holds every driver.
const loadedDrivers = async (script: string): Promise<string[]> => {
  const proc = Bun.spawn(['bun', '-e', script], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (code !== 0) throw new Error(err);

  return JSON.parse(out.trim().split('\n').at(-1)!);
};

const report = `
const drivers = Object.keys(require.cache)
  .map((k) => k.match(/drizzle-orm\\/(mysql2|node-postgres|bun-sql)\\//)?.[1])
  .filter(Boolean);
console.log(JSON.stringify([...new Set(drivers)].sort()));
`;

describe('database drivers load lazily', () => {
  it('importing the package evaluates no drizzle driver', async () => {
    const drivers = await loadedDrivers(`await import('./index.ts');${report}`);

    expect(drivers).toEqual([]);
  });

  it('a bun-sql database loads only the bun-sql driver', async () => {
    const drivers = await loadedDrivers(`
const { AsenaDatabaseService } = await import('./index.ts');
const service = new (class extends AsenaDatabaseService {})();
service.setDatabaseOptions({
  type: 'bun-sql',
  config: { host: 'localhost', port: 5432, database: 'db', user: 'u', password: 'p' },
  logger: console,
});
await service.createAdapter();
${report}`);

    expect(drivers).toEqual(['bun-sql']);
  });
});
