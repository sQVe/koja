import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dir, '..', 'src', 'data', 'fixtures', name), 'utf8'));

export const keyOf = (machine: string | null, path: string): string =>
  JSON.stringify([machine, path]);
