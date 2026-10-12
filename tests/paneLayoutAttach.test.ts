import { expect, it } from 'bun:test';

import { cliTestTimeoutMs } from './cliHarness.ts';
import { setup } from './paneAttachHarness.ts';

const region = (lines: string[], from: number, to: number): string[] =>
  lines.slice(0, 23).map((line) => line.slice(from, to).trimEnd());

it(
  'draws split panes at their layout rectangles with a border that marks the focused pane',
  async () => {
    const { phi, act, lines, until, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    await phi('pane', 'send', 'echo LEFTTEXT\n', '--pane', first);
    await phi('pane', 'send', 'echo RIGHTTEXT\n', '--pane', second);

    await until(() => lines().some((line) => line.includes('echo RIGHTTEXT')));

    const rows = lines();
    const leftRow = rows.find((line) => line.includes('echo LEFTTEXT')) ?? '';
    const rightRow = rows.find((line) => line.includes('echo RIGHTTEXT')) ?? '';

    expect(leftRow.startsWith('echo LEFTTEXT')).toBe(true);
    expect(rightRow.slice(41).startsWith('echo RIGHTTEXT')).toBe(true);

    const border = rows.slice(0, 23).map((line) => line.padEnd(80).charAt(40));

    expect(border.every((glyph) => glyph === '┝')).toBe(true);
  },
  cliTestTimeoutMs,
);

it(
  'sends typed keys only to the focused pane after pane focus',
  async () => {
    const { phi, act, lines, until, type, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    await phi('pane', 'send', 'echo RIGHTTEXT\n', '--pane', second);
    await until(() => lines().some((line) => line.includes('echo RIGHTTEXT')));

    expect(await act('focus', first)).toBe(first);

    await until(() => lines()[0]?.charAt(40) === '┥');

    const rightBefore = region(lines(), 41, 80);

    type('echo TYPED\r');

    await until(() => lines().some((line) => line.slice(0, 40).includes('echo TYPED')));

    expect(region(lines(), 41, 80)).toEqual(rightBefore);
  },
  cliTestTimeoutMs,
);

it(
  'sizes every pane to its layout rectangle on resize and fills the area of a closed pane',
  async () => {
    const { list, act, lines, until, resize, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    await until(() => lines()[0]?.charAt(40) === '┝');
    resize(100, 30);
    await until(() => lines()[0]?.charAt(50) === '┝');

    const resized = await list();

    expect(resized.map((pane) => [pane.id, pane.columns, pane.rows])).toEqual([
      [first, 50, 29],
      [second, 49, 29],
    ]);

    expect(
      lines()
        .slice(0, 29)
        .map((line) => line.padEnd(100).charAt(50)),
    ).toEqual(Array.from({ length: 29 }, () => '┝'));

    expect(await act('close', second)).toBe(second);
    await until(() => !lines().some((line) => line.includes('┝') || line.includes('┥')));

    const remaining = await list();

    expect(remaining.map((pane) => [pane.id, pane.columns, pane.rows])).toEqual([[first, 100, 29]]);
  },
  cliTestTimeoutMs,
);
