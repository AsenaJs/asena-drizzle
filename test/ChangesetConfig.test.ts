import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('changeset config', () => {
  it("disables changesets' Prettier formatting of CHANGELOG.md and changeset files", () => {
    const config = JSON.parse(readFileSync(join(import.meta.dir, '..', '.changeset', 'config.json'), 'utf8'));

    expect(config.prettier).toBe(false);
  });
});
