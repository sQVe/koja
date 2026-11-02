import { describe, expect, test } from 'bun:test';

import type { ExecResult, PreviewHost } from './previewLifecycle.ts';
import { createPreviewSession, findPreviewAddress, writePreview } from './previewLifecycle.ts';

interface Call {
  command: string;
  args: string[];
}

interface FakeHost {
  host: PreviewHost;
  hcCalls: string[][];
  execCalls: Call[];
}

const name = 'koja-picker-preview';
const fifo = '/home/u/.cache/herdr-koja-picker.fifo';
const script = '/home/u/.config/herdr-app/mods/koja-picker/preview.sh';

const fakeHost = (
  respond: {
    hc?: (args: string[]) => Promise<ExecResult>;
    exec?: (command: string, args: string[]) => Promise<ExecResult>;
  } = {},
): FakeHost => {
  const hcCalls: string[][] = [];
  const execCalls: Call[] = [];

  const host: PreviewHost = {
    name,
    fifo,
    script,
    hc: (args) => {
      hcCalls.push(args);

      return respond.hc ? respond.hc(args) : Promise.resolve({ code: 1, stdout: '' });
    },
    exec: (command, args) => {
      execCalls.push({ command, args });

      return respond.exec ? respond.exec(command, args) : Promise.resolve({ code: 0, stdout: '' });
    },
  };

  return { host, hcCalls, execCalls };
};

describe('findPreviewAddress', () => {
  test('reuses a live preview terminal', async () => {
    const { host, hcCalls } = fakeHost({
      hc: async () => ({ code: 0, stdout: JSON.stringify({ state: 'live', address: 'term-1' }) }),
    });

    expect(await findPreviewAddress(host)).toBe('term-1');
    expect(hcCalls).toEqual([['get', '--json', name]]);
  });

  test('removes a stale terminal and starts a new one', async () => {
    const { host, hcCalls } = fakeHost({
      hc: async (args) => {
        if (args[0] === 'get') {
          return { code: 0, stdout: JSON.stringify({ state: 'exited' }) };
        }

        if (args[0] === 'rm') {
          return { code: 0, stdout: '' };
        }

        return { code: 0, stdout: JSON.stringify({ address: 'term-2' }) };
      },
    });

    expect(await findPreviewAddress(host)).toBe('term-2');
    expect(hcCalls[1]).toEqual(['rm', name]);

    expect(hcCalls[2]).toEqual([
      'run',
      '--bg',
      '--json',
      '--no-parent',
      '--name',
      name,
      '--',
      script,
      'serve',
      fifo,
    ]);
  });

  test('answers null when the terminal cannot start', async () => {
    const { host } = fakeHost({ hc: async () => ({ code: 1, stdout: '' }) });

    expect(await findPreviewAddress(host)).toBeNull();
  });
});

describe('writePreview', () => {
  test('writes the address to the preview FIFO', async () => {
    const { host, execCalls } = fakeHost();

    expect(await writePreview(host, 'term-9')).toBe(true);
    expect(execCalls).toEqual([{ command: script, args: ['show', fifo, 'term-9'] }]);
  });

  test('writes a dash to show nothing', async () => {
    const { host, execCalls } = fakeHost();

    await writePreview(host, null);

    expect(execCalls[0]?.args).toEqual(['show', fifo, '-']);
  });

  test('answers false when the write exits nonzero', async () => {
    const { host } = fakeHost({ exec: async () => ({ code: 1, stdout: '' }) });

    expect(await writePreview(host, 'term-9')).toBe(false);
  });

  test('answers false when the write rejects', async () => {
    const { host } = fakeHost({
      exec: async () => {
        throw new Error('away');
      },
    });

    expect(await writePreview(host, 'term-9')).toBe(false);
  });
});

describe('createPreviewSession', () => {
  test('clears the preview on close', async () => {
    const { host, execCalls } = fakeHost();

    await createPreviewSession(host).close();

    expect(execCalls).toEqual([{ command: script, args: ['show', fifo, '-'] }]);
  });
});
