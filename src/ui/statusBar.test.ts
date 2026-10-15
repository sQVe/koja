import { expect, it } from 'bun:test';

import { tabEntry } from './statusBar.tsx';

it('shows a labeled tab as number and label, in brackets when active', () => {
  expect(tabEntry(2, 'build', true)).toBe('[2:build]');
  expect(tabEntry(3, 'logs', false)).toBe('3:logs');
});

it('shows an unlabeled tab as its number only', () => {
  expect(tabEntry(1, undefined, true)).toBe('[1]');
  expect(tabEntry(4, undefined, false)).toBe('4');
});
