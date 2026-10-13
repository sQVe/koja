import { expect, it } from 'bun:test';

import { sideListColumns } from '../src/layout.ts';
import { cliTestTimeoutMs } from './cliHarness.ts';
import { accentWord, setup } from './paneAttachHarness.ts';

const region = (lines: string[], from: number, to: number): string[] =>
  lines.slice(1, 22).map((line) => line.slice(from, to).trimEnd());

const glyphsAt = (lines: string[], row: number, columns: number[]): string[] =>
  columns.map((column) => lines[row]?.padEnd(100).charAt(column) ?? '');

it(
  'draws a lone pane with no frame and lists the full area',
  async () => {
    const { phi, list, lines, until, first } = await setup();

    await phi('pane', 'send', 'echo LONETEXT\n', '--pane', first);
    await until(() => lines().some((line) => line.startsWith('echo LONETEXT')));

    const frameGlyphs = /[┌┐└┘│─]/;

    expect(lines().some((line) => frameGlyphs.test(line))).toBe(false);

    const panes = await list();

    expect(panes.map((pane) => [pane.id, pane.columns, pane.rows])).toEqual([[first, 80, 23]]);
  },
  cliTestTimeoutMs,
);

it(
  'draws split panes in two frames and sizes each terminal to the inside of its frame',
  async () => {
    const { phi, list, act, lines, until, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    await phi('pane', 'send', 'echo LEFTTEXT\n', '--pane', first);
    await phi('pane', 'send', 'echo RIGHTTEXT\n', '--pane', second);

    await until(() => lines().some((line) => line.includes('echo RIGHTTEXT')));

    const rows = lines();
    const leftRow = rows.find((line) => line.includes('echo LEFTTEXT')) ?? '';
    const rightRow = rows.find((line) => line.includes('echo RIGHTTEXT')) ?? '';

    expect(leftRow.slice(1).startsWith('echo LEFTTEXT')).toBe(true);
    expect(rightRow.slice(42).startsWith('echo RIGHTTEXT')).toBe(true);

    expect(glyphsAt(rows, 0, [0, 39, 41, 79])).toEqual(['┌', '┐', '┌', '┐']);
    expect(glyphsAt(rows, 22, [0, 39, 41, 79])).toEqual(['└', '┘', '└', '┘']);
    expect(glyphsAt(rows, 10, [0, 39, 41, 79])).toEqual(['│', '│', '│', '│']);

    expect(rows.slice(0, 23).map((line) => line.padEnd(80).charAt(40))).toEqual(
      Array.from({ length: 23 }, () => ' '),
    );

    const frameInsides = [
      [first, 39 - 0 - 1, 22 - 0 - 1],
      [second, 79 - 41 - 1, 22 - 0 - 1],
    ];

    const sizes = (await list()).map((pane) => [pane.id, pane.columns, pane.rows]);

    expect(sizes).toEqual(frameInsides);
  },
  cliTestTimeoutMs,
);

it(
  'draws stacked panes with touching frames and sizes each terminal to the inside of its frame',
  async () => {
    const { list, act, lines, until, first } = await setup();
    const second = await act('split', first, '--direction', 'below');

    await until(() => lines()[12]?.charAt(0) === '┌');

    const rows = lines();

    expect(glyphsAt(rows, 0, [0, 79])).toEqual(['┌', '┐']);
    expect(glyphsAt(rows, 11, [0, 79])).toEqual(['└', '┘']);
    expect(glyphsAt(rows, 12, [0, 79])).toEqual(['┌', '┐']);
    expect(glyphsAt(rows, 22, [0, 79])).toEqual(['└', '┘']);

    const sizes = (await list()).map((pane) => [pane.id, pane.columns, pane.rows]);

    expect(sizes).toEqual([
      [first, 78, 10],
      [second, 78, 9],
    ]);
  },
  cliTestTimeoutMs,
);

it(
  'sends typed keys only to the focused pane after pane focus',
  async () => {
    const { phi, act, lines, foreground, until, type, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    await phi('pane', 'send', 'echo RIGHTTEXT\n', '--pane', second);
    await until(() => lines().some((line) => line.includes('echo RIGHTTEXT')));

    expect(await act('focus', first)).toBe(first);

    await until(() => foreground(0, 0) === accentWord && foreground(0, 41) !== accentWord);

    const rightBefore = region(lines(), 42, 79);

    type('echo TYPED\r');

    await until(() => lines().some((line) => line.slice(1, 39).includes('echo TYPED')));

    expect(region(lines(), 42, 79)).toEqual(rightBefore);
  },
  cliTestTimeoutMs,
);

it(
  'sizes every pane to its framed rectangle on resize and fills the area of a closed pane',
  async () => {
    const { list, act, lines, until, resize, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    await until(() => lines()[0]?.charAt(41) === '┌');
    resize(100 + sideListColumns, 30);
    await until(() => lines()[0]?.charAt(51) === '┌');

    const resized = await list();

    expect(resized.map((pane) => [pane.id, pane.columns, pane.rows])).toEqual([
      [first, 48, 27],
      [second, 47, 27],
    ]);

    expect(glyphsAt(lines(), 0, [0, 49, 51, 99])).toEqual(['┌', '┐', '┌', '┐']);
    expect(glyphsAt(lines(), 28, [0, 49, 51, 99])).toEqual(['└', '┘', '└', '┘']);

    expect(await act('close', second)).toBe(second);

    const frameGlyphs = /[┌┐└┘│─]/;

    await until(() => !lines().some((line) => frameGlyphs.test(line)));

    const remaining = await list();

    expect(remaining.map((pane) => [pane.id, pane.columns, pane.rows])).toEqual([[first, 100, 29]]);
  },
  cliTestTimeoutMs,
);
