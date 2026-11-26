import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LockTimeoutError, acquireCheckoutLock, acquireFileLock } from '../scripts/fileLock.ts';

let root: string;
let checkout: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'koja-file-lock-'));
  checkout = join(root, 'checkout');

  await mkdir(checkout);
});

afterEach(async () => {
  delete Bun.env['KOJA_CHECKOUT_LOCK_HELD'];

  await rm(root, { recursive: true, force: true });
});

describe('checkout lock', () => {
  test('a launcher that names this checkout lets the install skip the lock', async () => {
    const held = await acquireFileLock(checkout);

    try {
      Bun.env['KOJA_CHECKOUT_LOCK_HELD'] = checkout;

      const release = await acquireCheckoutLock(checkout);

      await release();
    } finally {
      await held();
    }
  });

  test('a launcher that names another checkout still waits for this lock', async () => {
    const held = await acquireFileLock(checkout);

    try {
      Bun.env['KOJA_CHECKOUT_LOCK_HELD'] = join(root, 'other-checkout');

      const failure = await acquireCheckoutLock(checkout, { timeoutMilliseconds: 300 }).catch(
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(LockTimeoutError);
    } finally {
      await held();
    }
  });

  test('releasing a lock twice keeps the second call harmless', async () => {
    const release = await acquireCheckoutLock(checkout);

    await release();
    await release();

    const again = await acquireCheckoutLock(checkout, { timeoutMilliseconds: 300 });

    await again();
  });
});
