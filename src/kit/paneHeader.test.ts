import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { Status } from 'herdr';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import { shellSize } from './size.ts';

interface HeaderOptions {
  program: null;
  name: string;
  role?: string;
  folder: string;
  status: Status | null;
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

const statusHeader = (status: Status | null): DrawnElement =>
  paneHeader({
    program: null,
    name: 'Pi',
    folder: '~/code/koja',
    status,
    focused: false,
    zoomed: false,
    width: shellSize.wideSpecimenWidth,
  });

describe('paneHeader status', () => {
  test('blocked draws the needs-you badge', () => {
    expect(drawnTexts(statusHeader('blocked'))).toContain('Needs you');
  });

  test('working and done draw their status mark', () => {
    expect(drawnIcons(statusHeader('working'))).toContain('loader-circle.svg');
    expect(drawnIcons(statusHeader('done'))).toContain('check.svg');
  });

  test('null and idle draw no status mark', () => {
    const quiet = drawnIcons(statusHeader(null));
    const idle = drawnIcons(statusHeader('idle'));

    expect(quiet).not.toContain('loader-circle.svg');
    expect(quiet).not.toContain('check.svg');
    expect(idle).not.toContain('loader-circle.svg');
    expect(idle).not.toContain('check.svg');
    expect(drawnTexts(statusHeader(null))).not.toContain('Needs you');
  });
});
