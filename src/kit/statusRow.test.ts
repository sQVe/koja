import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import {
  drawn,
  drawnIcons,
  drawnTexts,
  elementWithIcon,
  elementWithText,
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

const firstNumber = (element: DrawnElement | undefined, style: string): number =>
  Number(element?.styles[style]?.[0]);

describe('statusRow', () => {
  test('a stale running row draws a still mark and a dim state word', () => {
    const row = statusRow(staleRunning);

    expect(spinning(row)).toBe(false);
    expect(drawnIcons(row)).toEqual(['loader-circle.svg']);
    expect(elementWithText(row, 'running')?.textColors).toEqual([palette.dim]);
  });

  test('a live running row animates its mark', () => {
    expect(spinning(statusRow({ ...staleRunning, stale: false }))).toBe(true);
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
    const slot = frameOf(row).kids[0] as DrawnElement;

    expect(icon?.textColors).toEqual([palette.blocked]);
    expect(slot.styles['w']).toEqual([12]);
  });

  test('a status keeps its mark in the slot and a done row draws the check', () => {
    const row = statusRow({ mark: 'done', name: 'style' });

    expect(drawnIcons(row)).toEqual(['check.svg']);
    expect(elementWithIcon(row, 'check.svg')?.textColors).toEqual([palette.done]);
  });

  test('the detail line starts under the name', () => {
    const row = statusRow(staleRunning);
    const frame = frameOf(row);

    const nameEdge =
      firstNumber(frame, 'mx') +
      firstNumber(frame, 'pl') +
      firstNumber(frame.kids[0], 'w') +
      firstNumber(frame, 'gap');

    expect(row.kids[1]?.styles['ml']).toEqual([nameEdge]);
  });
});
