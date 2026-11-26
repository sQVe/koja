import { afterAll, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnIcons, elementWithIcon } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import type { AttentionStatus } from './attentionStatus.ts';

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => ({ blocked: '#ff0000' }) }));

const modulePath = './statusMark.ts';

const { attentionMark, spaceMark, statusMark } = (await import(modulePath)) as {
  attentionMark: (status: AttentionStatus | null) => DrawnElement | null;
  spaceMark: (status: 'blocked') => DrawnElement;
  statusMark: (status: 'blocked') => DrawnElement;
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

test('attention marks lead with the sidebar bubble for an ask and the triangle for a crash', () => {
  const ask = attentionMark('blocked');
  const crash = attentionMark('crashed');

  expect(drawnIcons(ask ?? drawn())).toEqual(['message-circle-question.svg']);
  expect(drawnIcons(crash ?? drawn())).toEqual(['triangle-alert.svg']);
  expect(elementWithIcon(crash ?? drawn(), 'triangle-alert.svg')?.textColors).toEqual(['#ff0000']);
  expect(attentionMark('idle')).toBeNull();
  expect(attentionMark(null)).toBeNull();
});
