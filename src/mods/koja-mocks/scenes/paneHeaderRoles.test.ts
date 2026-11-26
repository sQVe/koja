import { afterAll, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../tests/drawn.ts';
import { descendants, drawn } from '../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../tests/moduleFakes.ts';
import { controlSize, radius, shellSize, spacing } from '../../../kit/size.ts';

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn(), svg: () => drawn() }));

await mock.module('herdr', () => herdrFake());

await mock.module('../../../kit/index.ts', () =>
  kitIndexFake({
    colors: () => ({
      accent: '#accent',
      selected: '#selected',
      background: '#background',
      border: '#border',
    }),
    controlSize,
    paneHeader: () => drawn(),
    paneHeaderMenu: () => drawn(),
    radius,
    roleText: () => drawn(),
    shellSize,
    spacing,
  }),
);

const scenePath = './paneHeaderRoles.ts';

const { paneHeadersRolesScene } = (await import(scenePath)) as {
  paneHeadersRolesScene: () => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

test('the focused specimen has a different border from the unfocused ones', () => {
  const scene = paneHeadersRolesScene();

  const cards = descendants(scene).filter((element) =>
    element.backgroundColors.includes('#background'),
  );

  const borders = cards.map((card) => card.borderColors.at(-1));
  const [focused, ...unfocused] = borders;

  expect(focused).toBe('#accent');
  expect(unfocused.every((border) => border === '#selected')).toBe(true);
  expect(focused).not.toBe(unfocused[0]);
});
