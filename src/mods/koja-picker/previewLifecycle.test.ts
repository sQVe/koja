import { describe, expect, test } from 'bun:test';

import type { ExecResult, PreviewStartHost } from './previewLifecycle.ts';
import { createPreviewSession, findPreviewAddress, writePreview } from './previewLifecycle.ts';

interface Call {
  command: string;
  args: string[];
}

interface FakeHost {
  host: PreviewStartHost;
  hcCalls: string[][];
  execCalls: Call[];
}

const name = 'koja-picker-preview-v2';
const legacyName = 'koja-picker-preview';
const fifo = '/home/u/.cache/herdr-koja-picker-v2.fifo';
const script = '/home/u/.config/herdr-app/mods/koja-picker/preview.sh';

const fakeHost = (
  respond: {
    hc?: (args: string[]) => Promise<ExecResult>;
    exec?: (command: string, args: string[]) => Promise<ExecResult>;
  } = {},
): FakeHost => {
  const hcCalls: string[][] = [];
  const execCalls: Call[] = [];

  const host: PreviewStartHost = {
    name,
    legacyNames: [legacyName],
    fifo,
    script,
    sleep: async () => {},
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

    expect(hcCalls).toEqual([
      ['get', '--json', legacyName],
      ['get', '--json', name],
    ]);
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
    expect(hcCalls[2]).toEqual(['rm', name]);

    expect(hcCalls[3]).toEqual([
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

  test('kills and removes an older protocol terminal and starts the current one', async () => {
    const { host, hcCalls } = fakeHost({
      hc: async (args) => {
        if (args[0] === 'get' && args[2] === legacyName) {
          return {
            code: 0,
            stdout: JSON.stringify({
              state: 'live',
              address: 't2',
              argv: ['/bin/bash', script, 'serve', fifo],
            }),
          };
        }

        if (args[0] === 'get') {
          return { code: 1, stdout: '' };
        }

        if (args[0] === 'run') {
          return { code: 0, stdout: JSON.stringify({ address: 'term-new' }) };
        }

        return { code: 0, stdout: '' };
      },
    });

    expect(await findPreviewAddress(host)).toBe('term-new');
    expect(hcCalls).toContainEqual(['kill', legacyName]);
    expect(hcCalls).toContainEqual(['rm', legacyName]);
    expect(hcCalls.some((call) => call[0] === 'run')).toBe(true);
  });

  test('leaves a terminal with a legacy name but another command', async () => {
    const { host, hcCalls } = fakeHost({
      hc: async (args) => {
        if (args[0] === 'get' && args[2] === legacyName) {
          return {
            code: 0,
            stdout: JSON.stringify({
              state: 'finished',
              address: 't4',
              argv: ['/bin/bash', '-c', 'printf user-output; exit 0'],
            }),
          };
        }

        if (args[0] === 'get') {
          return { code: 1, stdout: '' };
        }

        return { code: 0, stdout: JSON.stringify({ address: 'term-new' }) };
      },
    });

    await findPreviewAddress(host);

    expect(hcCalls).not.toContainEqual(['kill', legacyName]);
    expect(hcCalls).not.toContainEqual(['rm', legacyName]);
  });

  test('answers null when the terminal cannot start', async () => {
    const { host } = fakeHost({ hc: async () => ({ code: 1, stdout: '' }) });

    expect(await findPreviewAddress(host)).toBeNull();
  });

  test('waits for the FIFO before answering the started terminal', async () => {
    let probes = 0;

    const { host } = fakeHost({
      hc: async (args) =>
        args[0] === 'get'
          ? { code: 1, stdout: '' }
          : { code: 0, stdout: JSON.stringify({ address: 'term-3' }) },
      exec: async () => {
        probes += 1;

        return { code: probes < 3 ? 1 : 0, stdout: '' };
      },
    });

    expect(await findPreviewAddress(host)).toBe('term-3');
    expect(probes).toBe(3);
  });

  test('answers null when the FIFO never appears', async () => {
    const { host } = fakeHost({
      hc: async (args) =>
        args[0] === 'get'
          ? { code: 1, stdout: '' }
          : { code: 0, stdout: JSON.stringify({ address: 'term-4' }) },
      exec: async () => ({ code: 1, stdout: '' }),
    });

    expect(await findPreviewAddress(host)).toBeNull();
  });

  test('waits for the FIFO when reusing a live terminal', async () => {
    let probes = 0;

    const { host } = fakeHost({
      hc: async () => ({
        code: 0,
        stdout: JSON.stringify({ state: 'live', address: 'term-live' }),
      }),
      exec: async () => {
        probes += 1;

        return { code: probes < 3 ? 1 : 0, stdout: '' };
      },
    });

    expect(await findPreviewAddress(host)).toBe('term-live');
    expect(probes).toBe(3);
  });

  test('answers null when a reused live terminal never makes its FIFO', async () => {
    const { host } = fakeHost({
      hc: async () => ({
        code: 0,
        stdout: JSON.stringify({ state: 'live', address: 'term-live' }),
      }),
      exec: async () => ({ code: 1, stdout: '' }),
    });

    expect(await findPreviewAddress(host)).toBeNull();
  });
});

describe('writePreview', () => {
  test('writes the sequencing address to the preview FIFO', async () => {
    const { host, execCalls } = fakeHost();

    expect(await writePreview(host, 'sessionone', 7, 'term-9')).toBe(true);

    expect(execCalls).toEqual([
      { command: script, args: ['show', fifo, 'sessionone', '7', 'term-9'] },
    ]);
  });

  test('writes a dash to show nothing', async () => {
    const { host, execCalls } = fakeHost();

    await writePreview(host, 'sessionone', 8, null);

    expect(execCalls[0]?.args).toEqual(['show', fifo, 'sessionone', '8', '-']);
  });

  test('answers false when the write exits nonzero', async () => {
    const { host } = fakeHost({ exec: async () => ({ code: 1, stdout: '' }) });

    expect(await writePreview(host, 'sessionone', 1, 'term-9')).toBe(false);
  });

  test('answers false when the write rejects', async () => {
    const { host } = fakeHost({
      exec: async () => {
        throw new Error('away');
      },
    });

    expect(await writePreview(host, 'sessionone', 1, 'term-9')).toBe(false);
  });
});

describe('createPreviewSession', () => {
  test('clears the preview on close', async () => {
    const { host, execCalls } = fakeHost();

    await createPreviewSession(host).close(async () => {});

    expect(execCalls).toHaveLength(1);
    expect(execCalls[0]?.command).toBe(script);
    expect(execCalls[0]?.args[0]).toBe('show');
    expect(execCalls[0]?.args[1]).toBe(fifo);
    expect(execCalls[0]?.args[2]).toMatch(/^[a-z0-9]+$/);
    expect(execCalls[0]?.args[3]).toBe('1');
    expect(execCalls[0]?.args[4]).toBe('-');
  });
});
