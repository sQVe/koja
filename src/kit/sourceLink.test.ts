import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface SourceLinkOptions {
  identifier: string;
  source: 'GitHub' | 'Linear' | 'tikk';
  repository?: string;
}

const palette = { foreground: '#4f4f5f' } as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake());

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './sourceLink.ts';

const { sourceLink } = (await import(modulePath)) as {
  sourceLink: (options: SourceLinkOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

describe('sourceLink', () => {
  test('a link names its source after the identifier', () => {
    expect(drawnTexts(sourceLink({ identifier: 'ME-1090', source: 'Linear' }))).toEqual([
      'ME-1090 · Linear',
    ]);
  });

  test('a GitHub link names its repository before the identifier', () => {
    const link = sourceLink({ identifier: '#41', source: 'GitHub', repository: 'koja' });

    expect(drawnTexts(link)).toEqual(['koja #41 · GitHub']);
  });

  test('a link is underlined, points, and keeps its whole text on hover', () => {
    const link = sourceLink({ identifier: 'ME-1090', source: 'Linear' });

    expect(link.textColors).toEqual([palette.foreground]);
    expect(link.styles['underline']).toBeDefined();
    expect(link.styles['cursor_pointer']).toBeDefined();
    expect(link.tooltipText).toBe('ME-1090 · Linear');
  });
});
