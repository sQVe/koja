import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import {
  drawn,
  drawnIcons,
  drawnTexts,
  elementWithIcon,
  elementWithText,
  numberStyle,
  spinning,
} from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import type { StatusRowOptions } from './statusRow.ts';

const palette = {
  ansi3: '#0a0a1a',
  blocked: '#0b0b1b',
  dim: '#2d2d3d',
  done: '#3e3e4e',
  foreground: '#4f4f5f',
  idle: '#5a5a6a',
  muted: '#6b6b7b',
  working: '#7c7c8c',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './statusRow.ts';

const { statusRow } = (await import(modulePath)) as {
  statusRow: (options: StatusRowOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const staleRunning: StatusRowOptions = {
  mark: 'working',
  name: 'tests',
  detail: 'started 8m ago',
  state: 'running',
  stale: true,
};

const frameOf = (row: DrawnElement): DrawnElement => row.kids[0] as DrawnElement;

const nameEdge = (row: DrawnElement): number => {
  const frame = frameOf(row);

  return (
    numberStyle(frame, 'mx') +
    numberStyle(frame, 'border') +
    numberStyle(frame, 'pl') +
    numberStyle(frame.kids[0], 'w') +
    numberStyle(frame, 'gap')
  );
};

describe('statusRow', () => {
  test('a stale running row draws a still mark and a dim state word', () => {
    const row = statusRow(staleRunning);

    expect(spinning(row)).toBe(false);
    expect(drawnIcons(row)).toEqual(['loader-circle.svg']);
    expect(elementWithText(row, 'running')?.textColors).toEqual([palette.dim]);
  });

  test('a live running row animates its mark and colours its state word', () => {
    const live = statusRow({ ...staleRunning, stale: false });

    expect(spinning(live)).toBe(true);
    expect(elementWithText(live, 'running')?.textColors).toEqual([palette.working]);
  });

  test('a row can keep its state word dim when the state is not the mark', () => {
    const row = statusRow({ ...staleRunning, stale: false, stateTone: 'dim' });

    expect(elementWithText(row, 'running')?.textColors).toEqual([palette.dim]);
  });

  test('a row draws its name, its state word, and then its detail line', () => {
    expect(drawnTexts(statusRow(staleRunning))).toEqual(['tests', 'running', 'started 8m ago']);
  });

  test('a row without a detail line draws its name row alone', () => {
    const row = statusRow({ mark: 'done', name: 'typecheck', state: 'passing' });

    expect(row.kids).toHaveLength(1);
    expect(drawnTexts(row)).toEqual(['typecheck', 'passing']);
  });

  test('a work need draws its own icon in the mark slot', () => {
    const row = statusRow({ mark: 'failing', name: 'typecheck', state: 'failing' });
    const icon = elementWithIcon(row, 'circle-x.svg');

    expect(icon?.textColors).toEqual([palette.blocked]);
  });

  test('every mark kind keeps the same slot, so the names share one edge', () => {
    const marks: StatusRowOptions['mark'][] = ['failing', 'working', 'done', 'review', null];
    const nameEdges = marks.map((mark) => nameEdge(statusRow({ mark, name: 'typecheck' })));
    const firstEdge = nameEdges[0] ?? Number.NaN;

    expect(Number.isFinite(firstEdge)).toBe(true);
    expect(nameEdges).toEqual(marks.map(() => firstEdge));
  });

  test('a status keeps its mark in the slot and a done row draws the check', () => {
    const row = statusRow({ mark: 'done', name: 'style' });

    expect(drawnIcons(row)).toEqual(['check.svg']);
    expect(elementWithIcon(row, 'check.svg')?.textColors).toEqual([palette.done]);
  });

  test('the detail line starts under the name', () => {
    const row = statusRow(staleRunning);

    expect(numberStyle(row.kids[1], 'pl')).toBe(nameEdge(row));
  });
});
