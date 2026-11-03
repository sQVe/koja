import { describe, expect, test } from 'bun:test';

import type { ExecResult, PreviewHost } from './previewLifecycle.ts';
import { PreviewSession } from './previewLifecycle.ts';

interface RecordedWrite {
  path: string;
  text: string;
  expected: string | null;
}

interface FakeHost {
  host: PreviewHost;
  hcCalls: string[][];
  writes: RecordedWrite[];
  kills: string[];
  removals: string[];
}

const folder = '/tmp/koja-preview-session';
const statePath = `${folder}/state`;
const script = '/app/mods/koja-picker/preview.sh';

const fakeHost = (
  respond: {
    newFolder?: () => Promise<string | null>;
    hc?: (args: string[]) => Promise<ExecResult>;
    read?: (path: string) => Promise<string | null>;
    write?: (path: string, text: string, expected: string | null) => Promise<void>;
  } = {},
): FakeHost => {
  const hcCalls: string[][] = [];
  const writes: RecordedWrite[] = [];
  const kills: string[] = [];
  const removals: string[] = [];

  return {
    hcCalls,
    writes,
    kills,
    removals,
    host: {
      script,
      newFolder: respond.newFolder ?? (async () => folder),
      hc: (args) => {
        hcCalls.push(args);

        return (
          respond.hc?.(args) ??
          Promise.resolve({
            code: 0,
            stderr: '',
            stdout: JSON.stringify({ address: 'viewer-1' }),
          })
        );
      },
      read: (path) => respond.read?.(path) ?? Promise.resolve(null),
      write: (path, text, expected) => {
        writes.push({ expected, path, text });

        return respond.write?.(path, text, expected) ?? Promise.resolve();
      },
      removeFolder: (path) => {
        removals.push(path);
      },
      kill: (terminal) => {
        kills.push(terminal);
      },
    },
  };
};

describe('PreviewSession.open', () => {
  test('starts one viewer with the state path and writes the first selection', async () => {
    const { host, hcCalls, writes } = fakeHost();

    const started = await new PreviewSession(host).open('term-1');

    expect(started).toEqual({ address: 'viewer-1', folder, statePath });
    expect(writes).toEqual([{ expected: null, path: statePath, text: 'term-1' }]);

    expect(hcCalls).toEqual([
      [
        'run',
        '--bg',
        '--rm',
        '--json',
        '--no-parent',
        '--label',
        'koja.preview=1',
        '--',
        script,
        'serve',
        statePath,
      ],
    ]);
  });

  test('answers null when the session folder cannot be made', async () => {
    const { host, hcCalls, writes } = fakeHost({ newFolder: async () => null });

    expect(await new PreviewSession(host).open('term-1')).toBeNull();
    expect(hcCalls).toEqual([]);
    expect(writes).toEqual([]);
  });

  test('answers null and removes the folder when the viewer cannot start', async () => {
    const { host, removals } = fakeHost({
      hc: async () => ({ code: 1, stderr: '', stdout: '' }),
    });

    expect(await new PreviewSession(host).open(null)).toBeNull();
    expect(removals).toEqual([folder]);
  });
});

describe('PreviewSession.show', () => {
  test('writes the newest address for each selection', async () => {
    const { host, writes } = fakeHost();
    const session = new PreviewSession(host, { address: 'viewer-1', folder, statePath });

    session.show('term-1');
    await session.settled();
    session.show('term-2');
    await session.settled();

    expect(writes.map((write) => write.text)).toEqual(['term-1', 'term-2']);
  });

  test('keeps one write in flight and coalesces a burst to the last address', async () => {
    const gate = Promise.withResolvers<undefined>();

    const { host, writes } = fakeHost({
      write: async (_path, text) => {
        if (text === 'term-1') {
          await gate.promise;
        }
      },
    });

    const session = new PreviewSession(host);

    await session.open('seed');
    session.show('term-1');
    session.show('term-2');
    session.show('term-3');

    expect(writes.map((write) => write.text)).toEqual(['seed', 'term-1']);

    gate.resolve(undefined);
    await session.settled();

    expect(writes.map((write) => write.text)).toEqual(['seed', 'term-1', 'term-3']);
  });

  test('reads the existing state before the first resumed write', async () => {
    const { host, writes } = fakeHost({ read: async () => 'term-1' });
    const session = new PreviewSession(host, { address: 'viewer-1', folder, statePath });

    session.show('term-2');
    await session.settled();

    expect(writes).toEqual([{ expected: 'term-1', path: statePath, text: 'term-2' }]);
  });

  test('writes an empty selection once and stops', async () => {
    const { host, writes } = fakeHost({ read: async () => 'term-1' });
    const session = new PreviewSession(host, { address: 'viewer-1', folder, statePath });

    session.show(null);
    await session.settled();
    session.show(null);
    await session.settled();

    expect(writes).toEqual([{ expected: 'term-1', path: statePath, text: '' }]);
  });

  test('kills a viewer whose start result arrives after close', async () => {
    const gate = Promise.withResolvers<ExecResult>();
    const { host, kills } = fakeHost({ hc: () => gate.promise });
    const session = new PreviewSession(host);

    const opening = session.open(null);

    await Bun.sleep(0);
    session.close();
    gate.resolve({ code: 0, stderr: '', stdout: JSON.stringify({ address: 'viewer-late' }) });

    expect(await opening).toBeNull();
    expect(kills).toEqual(['viewer-late']);
  });

  test('does not kill a viewer another owner has taken', async () => {
    const { host, kills, removals } = fakeHost();
    const session = new PreviewSession(host);

    await session.open('term-1');
    session.handOff();
    session.close();

    expect(kills).toEqual([]);
    expect(removals).toEqual([]);
  });

  test('writes a heartbeat while open and stops after close', async () => {
    const { host, writes } = fakeHost();
    const session = new PreviewSession(host);

    await session.open('term-1');
    writes.length = 0;

    await session.beat();
    await session.beat();

    expect(writes).toEqual([
      { expected: null, path: `${folder}/heartbeat`, text: '1' },
      { expected: '1', path: `${folder}/heartbeat`, text: '2' },
    ]);

    session.close();
    await session.beat();

    expect(writes).toHaveLength(2);
  });
});

describe('PreviewSession.close', () => {
  test('kills its viewer, removes its folder and writes no clear', async () => {
    const { host, kills, removals, writes } = fakeHost();
    const session = new PreviewSession(host, { address: 'viewer-9', folder, statePath });

    session.show('term-1');
    await session.settled();
    session.close();

    expect(kills).toEqual(['viewer-9']);
    expect(removals).toEqual([folder]);
    expect(writes.map((write) => write.text)).toEqual(['term-1']);
  });

  test('ignores selections after close', async () => {
    const { host, writes } = fakeHost();
    const session = new PreviewSession(host, { address: 'viewer-9', folder, statePath });

    session.close();
    session.show('term-1');
    await session.settled();

    expect(writes).toEqual([]);
  });
});
