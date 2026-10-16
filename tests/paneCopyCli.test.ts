import { expect, it } from 'bun:test';

import { z } from 'zod';

import { cliTestTimeoutMs } from './cliHarness.ts';
import { setup, waitForText } from './paneHarness.ts';

const failureSchema = z.object({ copied: z.literal(false), reason: z.string() });

const printedSchema = z.object({ text: z.string() });

const digits = '0123456789'.repeat(10);

it(
  'prints only the word between the columns, also when the word wraps',
  async () => {
    const { phi, list, first } = await setup(
      `echo alpha bravo charlie\necho ${digits}\nprintf done`,
    );

    await waitForText(phi, first, 'done');

    const word = await phi('pane', 'copy', first, '--from', '0:6', '--to', '0:10', '--print');

    expect({ exitCode: word.exitCode, stdout: word.stdout, stderr: word.stderr }).toEqual({
      exitCode: 0,
      stdout: 'bravo',
      stderr: '',
    });

    const [pane] = await list();
    const columns = pane?.columns ?? 0;

    expect(columns).toBeLessThan(digits.length);

    const wrapped = await phi(
      'pane',
      'copy',
      first,
      '--from',
      `1:${columns - 3}`,
      '--to',
      '2:2',
      '--print',
    );

    expect({ exitCode: wrapped.exitCode, stdout: wrapped.stdout }).toEqual({
      exitCode: 0,
      stdout: digits.slice(columns - 3, columns + 3),
    });
  },
  cliTestTimeoutMs,
);

it(
  'never prints half of a wide character',
  async () => {
    const { phi, first } = await setup('echo 漢字ab\nprintf done');

    await waitForText(phi, first, 'done');

    const ranges = [
      ['0:1', '0:2'],
      ['0:1', '0:4'],
      ['0:0', '0:1'],
      ['0:2', '0:2'],
    ] as const;

    const printed = await Promise.all(
      ranges.map(async ([from, to]) => {
        const run = await phi('pane', 'copy', first, '--from', from, '--to', to, '--print');

        return run.stdout;
      }),
    );

    expect(printed).toEqual(['漢字', '漢字a', '漢', '字']);
  },
  cliTestTimeoutMs,
);

it(
  'fails with noClient in json and exits non-zero when no client is attached, and print still prints',
  async () => {
    const { phi, first } = await setup('echo alpha bravo\nprintf done');

    await waitForText(phi, first, 'done');

    const copy = await phi('pane', 'copy', first, '--from', '0:0', '--to', '0:4', '--json');

    expect(copy.exitCode).not.toBe(0);

    expect(failureSchema.parse(JSON.parse(copy.stdout))).toEqual({
      copied: false,
      reason: 'noClient',
    });

    const printed = await phi('pane', 'copy', first, '--from', '0:0', '--to', '0:4', '--print');

    expect({ exitCode: printed.exitCode, stdout: printed.stdout }).toEqual({
      exitCode: 0,
      stdout: 'alpha',
    });

    const json = await phi(
      'pane',
      'copy',
      first,
      '--from',
      '0:0',
      '--to',
      '0:4',
      '--print',
      '--json',
    );

    expect(printedSchema.parse(JSON.parse(json.stdout))).toEqual({ text: 'alpha' });
  },
  cliTestTimeoutMs,
);
