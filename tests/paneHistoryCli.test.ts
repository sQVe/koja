import { describe, expect, it } from 'bun:test';

import { cliTestTimeoutMs } from './cliHarness.ts';
import { readJson, setup, waitForText } from './paneHarness.ts';
import type { PhiRunner } from './paneHarness.ts';

// The scripted shell ends its output with "done" and no newline, so the last row holds it.
const waitForDone = async (phi: PhiRunner, first: string): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const read = await readJson(phi, first, '--lines', '1');

    if (read.lines.at(-1) === 'done') {
      return;
    }

    await Bun.sleep(100);
  }

  throw new Error('The pane did not finish its output.');
};

const numbered = (prefix: string, first: number, last: number): string[] =>
  Array.from({ length: last - first + 1 }, (_, index) => `${prefix}${first + index}`);

it(
  'reads a row range and the last lines of a pane that printed 500 lines',
  async () => {
    const { phi, first } = await setup("seq 1 500 | sed 's/^/a/'\nprintf done");

    await waitForDone(phi, first);

    const range = await readJson(phi, first, '--from', '0', '--to', '9');

    expect(range).toMatchObject({ from: 0, to: 9, oldest: 0 });
    expect(range.lines).toEqual(numbered('a', 1, 10));

    const recent = await readJson(phi, first, '--source', 'recent', '--lines', '5');

    expect(recent.source).toBe('recent');
    expect(recent.lines).toEqual([...numbered('a', 497, 500), 'done']);
  },
  cliTestTimeoutMs,
);

it(
  'returns a line the terminal wrapped as one line when unwrapped and as rows otherwise',
  async () => {
    const wide = '0123456789'.repeat(10);
    const { phi, list, first } = await setup(`echo ${wide}\nprintf done`);

    await waitForDone(phi, first);

    const [pane] = await list();
    const columns = pane?.columns ?? 0;

    expect(columns).toBeLessThan(wide.length);

    const rows = await readJson(phi, first, '--source', 'recent', '--lines', '3');

    expect(rows.lines).toEqual([wide.slice(0, columns), wide.slice(columns), 'done']);

    const joined = await readJson(phi, first, '--source', 'recent-unwrapped', '--lines', '3');

    expect(joined.source).toBe('recent-unwrapped');
    expect(joined.lines).toEqual([wide, 'done']);
  },
  cliTestTimeoutMs,
);

it(
  'fails a range below the oldest kept row and names that row',
  async () => {
    const { phi, first } = await setup('seq 1 120000\nprintf done');

    await waitForDone(phi, first);

    const kept = await readJson(phi, first, '--lines', '1');

    expect(kept.oldest).toBeGreaterThan(0);

    const pruned = await phi('pane', 'read', first, '--from', '0', '--to', '9');

    expect(pruned.exitCode).not.toBe(0);
    expect(pruned.stdout).toBe('');
    expect(pruned.stderr).toContain(`oldest kept row is ${kept.oldest}`);

    const range = await readJson(
      phi,
      first,
      '--from',
      String(kept.oldest),
      '--to',
      String(kept.oldest),
    );

    expect(range.lines).toHaveLength(1);
  },
  cliTestTimeoutMs,
);

describe('a pane with more output than one reply holds', () => {
  const output = "seq 1 1200 | sed 's/^/n/'\nprintf done";

  it(
    'returns a range larger than one reply in full',
    async () => {
      const { phi, first } = await setup(output);

      await waitForDone(phi, first);

      const range = await readJson(phi, first, '--from', '0', '--to', '899');

      expect(range).toMatchObject({ from: 0, to: 899 });
      expect(range.lines).toEqual(numbered('n', 1, 900));
    },
    cliTestTimeoutMs,
  );

  it(
    'returns the last 1000 rows of a recent read',
    async () => {
      const { phi, first } = await setup(output);

      await waitForDone(phi, first);

      const recent = await readJson(phi, first, '--source', 'recent', '--lines', '1000');

      expect(recent.lines).toEqual([...numbered('n', 202, 1200), 'done']);
      expect(recent.to).toBe(1200);
    },
    cliTestTimeoutMs,
  );
});

it(
  'prints text with a final line feed for recent and visible reads and none for recent-unwrapped',
  async () => {
    const { phi, first } = await setup('echo one\necho two\nprintf done');

    await waitForDone(phi, first);

    const text = async (source: string) =>
      (await phi('pane', 'read', first, '--source', source, '--lines', '3')).stdout;

    expect(await text('recent')).toBe('one\ntwo\ndone\n');
    expect(await text('visible')).toBe('one\ntwo\ndone\n');
    expect(await text('recent-unwrapped')).toBe('one\ntwo\ndone');
  },
  cliTestTimeoutMs,
);

it.each(['recent', 'visible'])(
  'reads no lines and null bounds with --lines 0 from the %s source',
  async (source) => {
    const { phi, first } = await setup('echo one\nprintf done');

    await waitForDone(phi, first);

    const read = await readJson(phi, first, '--source', source, '--lines', '0');

    expect(read).toMatchObject({ from: null, to: null, lines: [] });
  },
  cliTestTimeoutMs,
);

it(
  'drops the blank rows at the end of a recent read',
  async () => {
    const { phi, first } = await setup('echo one');

    await waitForText(phi, first, 'one');

    const recent = await phi('pane', 'read', first, '--source', 'recent');
    const unwrapped = await phi('pane', 'read', first, '--source', 'recent-unwrapped');
    const json = await readJson(phi, first, '--source', 'recent');

    expect(recent.stdout).toBe('one\n');
    expect(unwrapped.stdout).toBe('one');
    expect(json.lines).toEqual(['one']);
    expect(json.to).toBeGreaterThan(json.from ?? 0);
  },
  cliTestTimeoutMs,
);

it(
  'prints empty text for a recent read of blank rows on the alternate screen',
  async () => {
    const { phi, first } = await setup("printf '\\033[?1049h\\033[Hx'");

    await waitForText(phi, first, 'x');

    const recent = await phi('pane', 'read', first, '--source', 'recent', '--lines', '3');
    const json = await readJson(phi, first, '--source', 'recent', '--lines', '3');

    expect(recent.stdout).toBe('');
    expect(json.lines).toEqual([]);
  },
  cliTestTimeoutMs,
);

it(
  'keeps the blank rows of an explicit range, one line per row',
  async () => {
    const { phi, first } = await setup("printf 'a\\n\\nb\\n\\n'\nprintf done");

    await waitForDone(phi, first);

    const range = await readJson(phi, first, '--from', '0', '--to', '3');

    expect(range).toMatchObject({ from: 0, to: 3 });
    expect(range.lines).toEqual(['a', '', 'b', '']);
  },
  cliTestTimeoutMs,
);

it(
  'prints one blank row of an explicit range as an empty line',
  async () => {
    const { phi, first } = await setup("printf 'a\\n\\nb\\n'\nprintf done");

    await waitForDone(phi, first);

    const text = await phi('pane', 'read', first, '--from', '1', '--to', '1');
    const json = await readJson(phi, first, '--from', '1', '--to', '1');

    expect(text.stdout).toBe('\n');
    expect(json.lines).toEqual(['']);
  },
  cliTestTimeoutMs,
);

it(
  'trims Unicode whitespace from recent rows and only spaces from recent-unwrapped lines',
  async () => {
    const { phi, first } = await setup("printf 'hello\\302\\240\\n'\nprintf done");

    await waitForDone(phi, first);

    const recent = await phi('pane', 'read', first, '--source', 'recent', '--lines', '2');
    const json = await readJson(phi, first, '--source', 'recent', '--lines', '2');

    const unwrapped = await phi(
      'pane',
      'read',
      first,
      '--source',
      'recent-unwrapped',
      '--lines',
      '2',
    );

    expect(recent.stdout).toBe('hello\ndone\n');
    expect(json.lines).toEqual(['hello', 'done']);
    expect(unwrapped.stdout).toBe('hello\u00a0\ndone');
  },
  cliTestTimeoutMs,
);
