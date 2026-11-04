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
  reads: string[];
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
  const reads: string[] = [];
  const writes: RecordedWrite[] = [];
  const kills: string[] = [];
  const removals: string[] = [];

  return {
    hcCalls,
    reads,
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
      read: (path) => {
        reads.push(path);

        return respond.read?.(path) ?? Promise.resolve(null);
      },
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
  test('writes an empty selection when opened without one', async () => {
    const { host, writes } = fakeHost();

    await new PreviewSession(host).open(null);

    expect(writes).toEqual([{ expected: null, path: statePath, text: '' }]);
  });

  test('removes the folder and writes nothing when closed while the folder is made', async () => {
    const gate = Promise.withResolvers<string | null>();
    const { host, hcCalls, removals, writes } = fakeHost({ newFolder: () => gate.promise });
    const session = new PreviewSession(host);

    const opening = session.open('term-1');
    session.close();
    gate.resolve(folder);

    expect(await opening).toBeNull();
    expect(writes).toEqual([]);
    expect(hcCalls).toEqual([]);
    expect(removals).toEqual([folder]);
  });

  test('answers null without starting a viewer when the first write fails', async () => {
    const { host, hcCalls, removals } = fakeHost({
      write: async () => {
        throw new Error('busy');
      },
    });

    expect(await new PreviewSession(host).open('term-1')).toBeNull();
    expect(hcCalls).toEqual([]);
    expect(removals).toEqual([folder]);
  });

  test('starts no viewer when a later open drops its state file', async () => {
    const gate = Promise.withResolvers<undefined>();
    const folders = [folder, '/tmp/koja-preview-other'];

    const { host, hcCalls } = fakeHost({
      newFolder: async () => folders.shift() ?? null,
      write: async (_path, text) => {
        if (text === 'first') {
          await gate.promise;
        }

        if (text === 'second') {
          throw new Error('busy');
        }
      },
    });

    const session = new PreviewSession(host);

    const first = session.open('first');

    await Bun.sleep(0);
    expect(await session.open('second')).toBeNull();

    gate.resolve(undefined);

    expect(await first).toBeNull();
    expect(hcCalls).toEqual([]);
  });

  test('answers null when starting the viewer throws', async () => {
    const { host, removals } = fakeHost({
      hc: async () => {
        throw new Error('no herdr');
      },
    });

    expect(await new PreviewSession(host).open(null)).toBeNull();
    expect(removals).toEqual([folder]);
  });

  test('answers null when the start fails even if it prints an address', async () => {
    const { host } = fakeHost({
      hc: async () => ({ code: 1, stderr: '', stdout: JSON.stringify({ address: 'viewer-1' }) }),
    });

    expect(await new PreviewSession(host).open(null)).toBeNull();
  });

  test('answers null when the start prints no JSON', async () => {
    const { host } = fakeHost({
      hc: async () => ({ code: 0, stderr: '', stdout: 'not json' }),
    });

    expect(await new PreviewSession(host).open(null)).toBeNull();
  });

  test('keeps the viewer it owned when a start prints no address', async () => {
    const { host, kills } = fakeHost({
      hc: async () => ({ code: 0, stderr: '', stdout: '{}' }),
    });

    const session = new PreviewSession(host, { address: 'viewer-1', folder, statePath });

    expect(await session.open(null)).toBeNull();

    session.close();

    expect(kills).toEqual(['viewer-1']);
  });

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

  test('writes a selection that arrives while the previous drain is finishing', async () => {
    const { host, writes } = fakeHost();
    const session = new PreviewSession(host, { address: 'viewer-1', folder, statePath });

    session.show('first');
    await session.settled();
    session.show('first');
    session.show('second');
    await session.settled();
    await session.settled();

    expect(writes.map((write) => write.text)).toEqual(['first', 'second']);
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

  test('treats an unreadable state file as absent', async () => {
    const { host, writes } = fakeHost({
      read: async () => {
        throw new Error('unreadable');
      },
    });

    const session = new PreviewSession(host, { address: 'viewer-1', folder, statePath });

    session.show('term-1');
    await session.settled();

    expect(writes).toEqual([{ expected: null, path: statePath, text: 'term-1' }]);
  });

  test('stops writing after a failed write until the next selection', async () => {
    let failed = false;

    const { host, writes } = fakeHost({
      write: async (_path, text) => {
        if (text === 'term-1' && !failed) {
          failed = true;

          throw new Error('busy');
        }
      },
    });

    const session = new PreviewSession(host, { address: 'viewer-1', folder, statePath });

    session.show('term-1');
    await session.settled();

    expect(writes.map((write) => write.text)).toEqual(['term-1']);

    session.show('term-2');
    await session.settled();

    expect(writes).toEqual([
      { expected: null, path: statePath, text: 'term-1' },
      { expected: null, path: statePath, text: 'term-2' },
    ]);
  });

  test('stops writing once closed, even with a newer selection waiting', async () => {
    const gate = Promise.withResolvers<undefined>();

    const { host, writes } = fakeHost({
      write: async (_path, text) => {
        if (text === 'term-1') {
          await gate.promise;
        }
      },
    });

    const session = new PreviewSession(host, { address: 'viewer-1', folder, statePath });

    session.show('term-1');
    session.show('term-2');
    session.close();
    gate.resolve(undefined);
    await session.settled();

    expect(writes.map((write) => write.text)).toEqual(['term-1']);
  });

  test('stops writing selections once an open drops its state file', async () => {
    const gate = Promise.withResolvers<undefined>();

    const { host, writes } = fakeHost({
      newFolder: async () => '/tmp/koja-preview-other',
      hc: async () => ({ code: 1, stderr: '', stdout: '' }),
      write: async (_path, text) => {
        if (text === 'term-1') {
          await gate.promise;
        }
      },
    });

    const session = new PreviewSession(host, { address: 'viewer-1', folder, statePath });

    session.show('term-1');
    await Bun.sleep(0);
    session.show('term-2');
    await session.open('other');

    gate.resolve(undefined);
    await session.settled();

    expect(writes.map((write) => write.text)).toEqual(['term-1', 'other']);
  });

  test('kills a viewer whose start result arrives after close', async () => {
    const gate = Promise.withResolvers<ExecResult>();
    const { host, kills, removals } = fakeHost({ hc: () => gate.promise });
    const session = new PreviewSession(host);

    const opening = session.open(null);

    await Bun.sleep(0);
    session.close();
    gate.resolve({ code: 0, stderr: '', stdout: JSON.stringify({ address: 'viewer-late' }) });

    expect(await opening).toBeNull();
    expect(kills).toEqual(['viewer-late']);
    expect(removals).toEqual([folder]);
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

describe('PreviewSession.beat', () => {
  test('writes no heartbeat before the session has a folder', async () => {
    const { host, reads, writes } = fakeHost();

    await new PreviewSession(host).beat();

    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  });

  test('reads the heartbeat file it will overwrite', async () => {
    const { host, reads } = fakeHost();
    const session = new PreviewSession(host);

    await session.open('term-1');
    await session.beat();

    expect(reads).toEqual([`${folder}/heartbeat`]);
  });

  test('treats an unreadable heartbeat as absent', async () => {
    const { host, writes } = fakeHost({
      read: async () => {
        throw new Error('unreadable');
      },
    });

    const session = new PreviewSession(host);

    await session.open('term-1');
    writes.length = 0;
    await session.beat();

    expect(writes).toEqual([{ expected: null, path: `${folder}/heartbeat`, text: '1' }]);
  });

  test('reads the heartbeat again after a failed write', async () => {
    let heartbeatWrites = 0;

    const { host, writes } = fakeHost({
      write: async (path) => {
        if (path === `${folder}/heartbeat`) {
          heartbeatWrites += 1;

          if (heartbeatWrites === 1) {
            throw new Error('busy');
          }
        }
      },
    });

    const session = new PreviewSession(host);

    await session.open('term-1');
    writes.length = 0;
    await session.beat();
    await session.beat();

    expect(writes).toEqual([
      { expected: null, path: `${folder}/heartbeat`, text: '1' },
      { expected: null, path: `${folder}/heartbeat`, text: '2' },
    ]);
  });
});

describe('PreviewSession.close', () => {
  test('removes nothing when closed before any folder exists', () => {
    const { host, kills, removals } = fakeHost();
    const session = new PreviewSession(host);

    session.close();

    expect(kills).toEqual([]);
    expect(removals).toEqual([]);
  });

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
