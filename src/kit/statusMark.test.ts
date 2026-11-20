import { afterAll, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnIcons, elementWithIcon } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import { markSize, paneHeaderWidth, spacing } from './size.ts';

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => ({ blocked: '#ff0000' }) }));

const modulePath = './statusMark.ts';

const { spaceMark, statusMark, statusMarkWidth } = (await import(modulePath)) as {
  spaceMark: (status: 'blocked') => DrawnElement;
  statusMark: (status: 'blocked') => DrawnElement;
  statusMarkWidth: (status: 'blocked' | 'working' | 'done' | 'idle' | null) => number;
};

afterAll(() => {
  mock.restore();
});

test('blocked spaces draw a red question bubble while other blocked marks keep the dot', () => {
  const space = spaceMark('blocked');
  const status = statusMark('blocked');

  expect(drawnIcons(space)).toEqual(['message-circle-question.svg']);
  expect(elementWithIcon(space, 'message-circle-question.svg')?.textColors).toEqual(['#ff0000']);
  expect(drawnIcons(status)).toEqual([]);
  expect(status.kids[0]?.backgroundColors).toEqual(['#ff0000']);
});

test('status widths match the mark that shows', () => {
  const blockedWidth = 'Needs you'.length * paneHeaderWidth.glyph + spacing.small * 2;

  expect(statusMarkWidth(null)).toBe(0);
  expect(statusMarkWidth('idle')).toBe(0);
  expect(statusMarkWidth('working')).toBe(markSize.slot);
  expect(statusMarkWidth('done')).toBe(markSize.slot);
  expect(statusMarkWidth('blocked')).toBe(blockedWidth);
});
