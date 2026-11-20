import { mock } from 'bun:test';

import type { SnapshotNotices } from '../src/data/storedSnapshot.ts';
import {
  createSnapshotNotices,
  readStoredSnapshot,
  snapshotNotices,
} from '../src/data/storedSnapshot.ts';

// Bun keeps one module instance per file in a run, so the module-local reporter is spent by the
// first test that reads an unreadable snapshot. This installs a fresh reporter as that module's
// export for one test and puts the real one back afterwards.
const real = { createSnapshotNotices, readStoredSnapshot, snapshotNotices };

const install = async (notices: SnapshotNotices): Promise<void> => {
  await mock.module('../src/data/storedSnapshot.ts', () => ({
    createSnapshotNotices: real.createSnapshotNotices,
    readStoredSnapshot: real.readStoredSnapshot,
    snapshotNotices: notices,
  }));
};

export const withFreshSnapshotCopy = async (
  body: (messages: string[]) => void | Promise<void>,
): Promise<void> => {
  const messages: string[] = [];

  await install(createSnapshotNotices((message) => messages.push(message)));

  try {
    await body(messages);
  } finally {
    await install(real.snapshotNotices);
  }
};
