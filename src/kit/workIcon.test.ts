import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import {
  drawn,
  drawnIcons,
  drawnTooltips,
  elementWithIcon,
  elementWithTooltip,
  elementsWithStyle,
  numberStyle,
} from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import { iconSize } from './size.ts';

type WorkNeed = 'conflict' | 'failing' | 'review' | 'restack' | 'merge';

const palette = {
  ansi3: '#3a3a3a',
  blocked: '#1b1b1b',
  done: '#5d5d5d',
  foreground: '#000000',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './workIcon.ts';

const { emptyWorkSlot, workIcon } = (await import(modulePath)) as {
  emptyWorkSlot: () => DrawnElement;
  workIcon: (need: WorkNeed, options?: { bare?: boolean }) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const needs: { need: WorkNeed; icon: string; color: string; tooltip: string }[] = [
  { need: 'conflict', icon: 'triangle-alert.svg', color: palette.blocked, tooltip: 'Conflict' },
  { need: 'failing', icon: 'circle-x.svg', color: palette.blocked, tooltip: 'CI failing' },
  { need: 'review', icon: 'message-square.svg', color: palette.ansi3, tooltip: 'Review needed' },
  { need: 'restack', icon: 'layers.svg', color: palette.ansi3, tooltip: 'Restack needed' },
  { need: 'merge', icon: 'git-merge.svg', color: palette.done, tooltip: 'Ready to merge' },
];

describe('workIcon', () => {
  test('each need draws its icon in its color with its tooltip', () => {
    const drawnNeeds = needs.map((expected) => {
      const slot = workIcon(expected.need);

      return {
        need: expected.need,
        icon: drawnIcons(slot)[0] ?? '',
        color: elementWithIcon(slot, drawnIcons(slot)[0] ?? '')?.textColors.at(-1) ?? '',
        tooltip: drawnTooltips(slot)[0] ?? '',
      };
    });

    expect(drawnNeeds).toEqual(needs);
  });

  test('a bare need keeps its tooltip on a container that can carry the hover', () => {
    const bare = workIcon('failing', { bare: true });
    const tooltip = elementWithTooltip(bare);

    expect(tooltip?.path).toBeNull();
    expect(tooltip?.tooltipText).toBe('CI failing');
  });

  test('a bare need keeps no slot of its own, while the default keeps one', () => {
    const sizedContainers = (need: WorkNeed, options: { bare?: boolean }): number =>
      elementsWithStyle(workIcon(need, options), 'size').filter((part) => part.path === null)
        .length;

    expect(sizedContainers('failing', {})).toBe(1);
    expect(sizedContainers('failing', { bare: true })).toBe(0);
  });

  test('a work need draws its glyph at the size the icon sets', () => {
    const glyph = elementWithIcon(workIcon('failing'), 'circle-x.svg') ?? undefined;

    expect(numberStyle(glyph, 'size')).toBe(iconSize.small);
  });

  test('the empty slot draws no icon and no tooltip', () => {
    const slot = emptyWorkSlot();

    expect(drawnIcons(slot)).toEqual([]);
    expect(drawnTooltips(slot)).toEqual([]);
  });
});
