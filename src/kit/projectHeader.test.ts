import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { click, drawn, drawnIcons, drawnTexts } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface HeaderOptions {
  name: string;
  machine?: string;
  folded: boolean;
  hidden: number;
  onToggle: () => void;
}

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => ({}) }));

const modulePath = './projectHeader.ts';

const { projectHeader } = (await import(modulePath)) as {
  projectHeader: (options: HeaderOptions) => DrawnElement;
};

const options: HeaderOptions = {
  name: 'koja',
  folded: false,
  hidden: 2,
  onToggle: () => undefined,
};

afterAll(() => {
  mock.restore();
});

describe('projectHeader', () => {
  test('remote headers show the machine and server icon only when supplied', () => {
    const remote = projectHeader({ ...options, machine: 'build-box' });
    const local = projectHeader(options);

    expect(drawnTexts(remote)).toContain('build-box');
    expect(drawnIcons(remote)).toContain('server.svg');
    expect(drawnTexts(local)).toEqual(['koja']);
    expect(drawnIcons(local)).not.toContain('server.svg');
  });

  test('only folded headers show the hidden count and chevron', () => {
    const folded = projectHeader({ ...options, folded: true });
    const open = projectHeader(options);

    expect(drawnTexts(folded)).toContain('2 more');
    expect(drawnIcons(folded)).toContain('chevron-right.svg');
    expect(drawnTexts(open)).not.toContain('2 more');
    expect(drawnIcons(open)).not.toContain('chevron-right.svg');
  });

  test('clicking the header toggles once', () => {
    let toggles = 0;

    const header = projectHeader({
      ...options,
      onToggle: () => {
        toggles += 1;
      },
    });

    click(header);

    expect(toggles).toBe(1);
  });
});
