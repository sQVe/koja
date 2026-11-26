import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts, elementWithText } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import { clearOf } from './palette.ts';

interface SegmentedChipOptions {
  label: string;
  count: number;
  active: boolean;
  start?: DrawnElement;
}

const palette = {
  border: '#999ca7',
  dim: '#525460',
  foreground: '#1e2028',
  hover: '#cdd0d7',
  muted: '#3a3d4c',
  selected: '#7f828d',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './segmentedChip.ts';

const { segmentedChip } = (await import(modulePath)) as {
  segmentedChip: (options: SegmentedChipOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

describe('segmentedChip', () => {
  test('the active chip takes the hover fill, an outline, and the main ink', () => {
    const chip = segmentedChip({ active: true, count: 8, label: 'All' });

    expect(chip.backgroundColors).toContain(palette.hover);
    expect(chip.borderColors).toContain(palette.border);
    expect(elementWithText(chip, 'All')?.textColors).toContain(palette.foreground);
    expect(elementWithText(chip, '8')?.textColors).toContain(palette.dim);
  });

  test('an inactive chip keeps a clear outline and the muted ink', () => {
    const chip = segmentedChip({ active: false, count: 1, label: 'Done' });

    expect(chip.backgroundColors).toEqual([]);
    expect(chip.borderColors).toContain(clearOf(palette.border));
    expect(elementWithText(chip, 'Done')?.textColors).toContain(palette.muted);
  });

  test('an inactive chip outlines itself while hovered', () => {
    const chip = segmentedChip({ active: false, count: 1, label: 'Done' });
    const hovered = drawn();
    const declare = chip.styles['hover']?.[0] as ((element: DrawnElement) => void) | undefined;

    expect(declare).toBeDefined();

    declare?.(hovered);

    expect(hovered.borderColors).toContain(palette.selected);
  });

  test('an inactive chip brightens its label and its count while hovered', () => {
    const chip = segmentedChip({ active: false, count: 1, label: 'Done' });

    for (const text of ['Done', '1']) {
      const ink = drawn();
      const part = elementWithText(chip, text);
      const declare = part?.styles['hover']?.[0] as ((element: DrawnElement) => void) | undefined;

      expect(part).not.toBeNull();
      expect(declare).toBeDefined();

      declare?.(ink);

      expect(ink.textColors).toContain(palette.foreground);
    }
  });

  test('an active chip declares no hover look of its own', () => {
    const chip = segmentedChip({ active: true, count: 8, label: 'All' });
    const label = elementWithText(chip, 'All');
    const count = elementWithText(chip, '8');

    expect(label).not.toBeNull();
    expect(count).not.toBeNull();

    expect(chip.styles['hover']).toBeUndefined();
    expect(label?.styles['hover']).toBeUndefined();
    expect(count?.styles['hover']).toBeUndefined();
  });

  test('draws its start element before the label and the count', () => {
    const start = drawn();

    start.texts.push('mark');

    const chip = segmentedChip({ active: false, count: 2, label: 'Waiting', start });

    expect(drawnTexts(chip)).toEqual(['mark', 'Waiting', '2']);
  });
});
