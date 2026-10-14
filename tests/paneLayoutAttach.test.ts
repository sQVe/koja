import { expect, it, onTestFinished } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

it(
  'draws only the focused pane over the whole area while zoomed and both panes after a second zoom',
  async () => {
    const { list, act, lines, until, type, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    await until(() => lines()[0]?.charAt(41) === '┌');

    type('\x02z');

    const frameGlyphs = /[┌┐└┘│─]/;

    await until(() => !lines().some((line) => frameGlyphs.test(line)));

    const zoomed = await list();

    expect(zoomed.find((pane) => pane.id === second)).toMatchObject({ columns: 80, rows: 23 });

    type('z');

    await until(() => glyphsAt(lines(), 0, [0, 39, 41, 79]).join('') === '┌┐┌┐');

    const restored = await list();

    expect(restored.map((pane) => [pane.id, pane.columns, pane.rows])).toEqual([
      [first, 38, 21],
      [second, 37, 21],
    ]);
  },
  cliTestTimeoutMs,
);

it(
  'moves the split edge by one cell on > in Phi mode',
  async () => {
    const { list, act, lines, until, type, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    await until(() => lines()[0]?.charAt(41) === '┌');

    type('\x02>');

    await until(() => lines()[0]?.charAt(42) === '┌');

    const sizes = (await list()).map((pane) => [pane.id, pane.columns, pane.rows]);

    expect(sizes).toEqual([
      [first, 39, 21],
      [second, 36, 21],
    ]);
  },
  cliTestTimeoutMs,
);

it(
  'starts the pane of the split key in the folder of the focused pane',
  async () => {
    const { phi, list, type, first } = await setup();
    const target = await realpath(await mkdtemp(join(tmpdir(), 'phi-split-key-')));

    onTestFinished(() => rm(target, { recursive: true, force: true }));

    await phi('pane', 'send', `cd ${target}\n`, '--pane', first);

    let panes = await list();

    for (let attempt = 0; attempt < 100 && panes[0]?.cwd !== target; attempt += 1) {
      await Bun.sleep(100);
      panes = await list();
    }

    type('\x02s');

    for (let attempt = 0; attempt < 100 && panes.length < 2; attempt += 1) {
      await Bun.sleep(100);
      panes = await list();
    }

    expect(panes.map((pane) => pane.cwd)).toEqual([target, target]);
  },
  cliTestTimeoutMs,
);

it(
  'starts the tab of the new-tab key in the folder of the pane the client view shows',
  async () => {
    const { phi, list, type, first } = await setup();
    const shown = await realpath(await mkdtemp(join(tmpdir(), 'phi-tab-shown-')));
    const hidden = await realpath(await mkdtemp(join(tmpdir(), 'phi-tab-hidden-')));

    onTestFinished(() => rm(shown, { recursive: true, force: true }));
    onTestFinished(() => rm(hidden, { recursive: true, force: true }));

    const untilPanes = async (accept: (panes: Awaited<ReturnType<typeof list>>) => boolean) => {
      let panes = await list();

      for (let attempt = 0; attempt < 100 && !accept(panes); attempt += 1) {
        await Bun.sleep(100);
        panes = await list();
      }

      return panes;
    };

    await phi('pane', 'send', `cd ${shown}\n`, '--pane', first);
    await untilPanes((panes) => panes[0]?.cwd === shown);

    type('\x02t');

    const second = (await untilPanes((panes) => panes.length === 2))[1];

    expect(second?.cwd).toBe(shown);

    await phi('pane', 'send', `cd ${hidden}\n`, '--pane', second?.id ?? '');
    await untilPanes((panes) => panes[1]?.cwd === hidden);

    // Phi mode stays on after the prefix, so the next keys need no prefix.
    type('H');
    await untilPanes((panes) => panes.find((pane) => pane.focused)?.id === first);
    type('t');

    const panes = await untilPanes((known) => known.length === 3);

    expect(panes.map((pane) => pane.cwd)).toEqual([shown, hidden, shown]);
  },
  cliTestTimeoutMs,
);
