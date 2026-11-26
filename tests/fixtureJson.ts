import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readFixture = (folder: string, name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dir, '..', 'src', 'data', folder, name), 'utf8'));

export const fixture = (name: string): unknown => readFixture('fixtures', name);

export const pullRetryFixture = (name: string): unknown =>
  readFixture(join('pullRetry', 'fixtures'), name);
