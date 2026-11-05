import { expect, test } from 'bun:test';

import { missing } from './missingModule.ts';

test('fails to load', () => {
  expect(missing).toBe(true);
});
