import { describe, expect, test } from 'bun:test';

import type { NormalRunHost } from './normalRun.ts';
import { runNormalKeys, takeNormalKeys } from './normalRun.ts';

interface RunCall {
  command: string;
  args: Record<string, unknown> | undefined;
}

interface FakeHost extends NormalRunHost {
  values: Record<string, unknown>;
  runs: RunCall[];
  writes: string[];
}

const fakeHost = (values: Record<string, unknown> = {}): FakeHost => {
  const runs: RunCall[] = [];
  const writes: string[] = [];

  return {
    values,
    runs,
    writes,
    shared: (key) => values[key],
    setShared: (key, value) => {
      values[key] = value;
      writes.push(key);
    },
    run: (command, args) => {
      runs.push({ command, args });
    },
  };
};

describe('normal keys handed to normal mode', () => {
  test('ask normal mode to run them when it is on', () => {
    const host = fakeHost({ 'koja-modal': true });

    runNormalKeys(host, ['t', 'l']);

    expect(host.runs).toEqual([{ command: 'koja-modal.run-keys', args: undefined }]);
    expect(takeNormalKeys(host)).toEqual(['t', 'l']);
  });

  test('open normal mode when it is off', () => {
    const host = fakeHost();

    runNormalKeys(host, ['t', 'l']);

    expect(host.runs).toEqual([{ command: 'mod.open', args: { name: 'koja-modal' } }]);
    expect(takeNormalKeys(host)).toEqual(['t', 'l']);
  });

  test('are taken once', () => {
    const host = fakeHost();

    runNormalKeys(host, ['t', 'l']);
    takeNormalKeys(host);

    const writesAfterTake = host.writes.length;

    expect(takeNormalKeys(host)).toBeNull();
    expect(host.writes).toHaveLength(writesAfterTake);
  });

  test('are dropped when the stored value is not a list of keys', () => {
    for (const malformed of [[], ['t', 1], 't l', { keys: ['t'] }]) {
      const host = fakeHost();

      runNormalKeys(host, ['t']);

      const pendingKey = host.writes[0] ?? '';

      host.values[pendingKey] = malformed;

      expect(takeNormalKeys(host)).toBeNull();
      expect(takeNormalKeys(host)).toBeNull();
      expect(host.values[pendingKey]).toBeNull();
    }
  });

  test('are not written back when nothing is pending', () => {
    const host = fakeHost();

    expect(takeNormalKeys(host)).toBeNull();
    expect(host.writes).toEqual([]);
  });
});
