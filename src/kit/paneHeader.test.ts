import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import { shellSize } from './size.ts';

interface HeaderOptions {
  program: null;
  name: string;
  role?: string;
  folder: string;
  status: null;
  focused: boolean;
  zoomed: boolean;
  width: number;
}

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () =>
  herdrFake({ theme: () => ({ foreground: '#000000', muted: '#111111' }) }),
);

const modulePath = './paneHeader.ts';

const { paneHeader } = (await import(modulePath)) as {
  paneHeader: (options: HeaderOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const header = (role?: string): DrawnElement =>
  paneHeader({
    program: null,
    name: 'Pi',
    folder: '~/code/koja',
    status: null,
    focused: false,
    zoomed: false,
    width: shellSize.wideSpecimenWidth,
    ...(role === undefined ? {} : { role }),
  });

const textsAfterName = (element: DrawnElement): string[] | null => {
  const nameIndex = element.kids.findIndex((kid) => kid.texts.includes('Pi'));
  const next = element.kids.at(nameIndex + 1);

  return next === undefined ? null : drawnTexts(next);
};

describe('paneHeader role badge', () => {
  test('the role badge draws right after the pane name', () => {
    expect(textsAfterName(header('architect'))).toEqual(['architect']);
  });

  test('a pane without a role draws no badge', () => {
    expect(textsAfterName(header())).toEqual([]);
  });

  test('an empty role draws no badge', () => {
    expect(textsAfterName(header(''))).toEqual([]);
  });
});
