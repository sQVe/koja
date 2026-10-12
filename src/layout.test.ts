import { expect, it } from 'bun:test';

import { paneSize, sideListColumns, sideListWidth } from './layout.ts';

it('gives the pane 80x24 without a client', () => {
  expect(paneSize(undefined)).toEqual({ columns: 80, rows: 24 });
});

it('leaves the side list columns and one client row for the status bar', () => {
  expect(paneSize({ columns: 120, rows: 40 })).toEqual({
    columns: 120 - sideListColumns,
    rows: 39,
  });
});

it('keeps the pane at least 1x1', () => {
  expect(paneSize({ columns: 1, rows: 1 })).toEqual({ columns: 1, rows: 1 });
  expect(paneSize({ columns: 0, rows: 0 })).toEqual({ columns: 1, rows: 1 });
});

it('shows the side list only when the client is wider than 40 columns', () => {
  expect(sideListWidth(41)).toBe(sideListColumns);
  expect(sideListWidth(40)).toBe(0);
  expect(paneSize({ columns: 41, rows: 10 }).columns).toBe(21);
  expect(paneSize({ columns: 40, rows: 10 }).columns).toBe(40);
});
