import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import {
  click,
  drawn,
  drawnIcons,
  drawnTexts,
  elementWithIcon,
  elementsWithBorder,
  press,
} from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface HeaderBase {
  name: string;
  machine?: string;
  folded: boolean;
  hidden: number;
  onToggle: () => void;
}

interface FoldHeaderOptions extends HeaderBase {
  kind: 'fold';
}

interface SpaceHeaderOptions extends HeaderBase {
  kind: 'space';
  mark: DrawnElement;
  selected: boolean;
  cursor: boolean;
  hovered: boolean;
  dragged: boolean;
}

type HeaderOptions = FoldHeaderOptions | SpaceHeaderOptions;

const themeColors = { accent: '#000000', selected: '#333333', dim: '#666666' };

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => themeColors }));

const modulePath = './projectHeader.ts';

const { projectHeader } = (await import(modulePath)) as {
  projectHeader: (options: HeaderOptions) => DrawnElement;
};

const options: FoldHeaderOptions = {
  kind: 'fold',
  name: 'koja',
  folded: false,
  hidden: 2,
  onToggle: () => undefined,
};

afterAll(() => {
  mock.restore();
});

const markOf = (): DrawnElement => {
  const mark = drawn();

  mark.texts.push('agent-mark');

  return mark;
};

const spaceOptions = (overrides: Partial<SpaceHeaderOptions>): SpaceHeaderOptions => ({
  kind: 'space',
  name: 'koja',
  folded: false,
  hidden: 0,
  onToggle: () => undefined,
  mark: markOf(),
  selected: false,
  cursor: false,
  hovered: false,
  dragged: false,
  ...overrides,
});

const pressContext = { stop_propagation: () => undefined };

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

describe('projectHeader for a main space', () => {
  test('shows the space mark before the project name', () => {
    expect(drawnTexts(projectHeader(spaceOptions({})))).toEqual(['agent-mark', 'koja']);
  });

  test('fills a selected header and outlines the header under the list cursor', () => {
    const selected = projectHeader(spaceOptions({ selected: true }));
    const cursor = projectHeader(spaceOptions({ cursor: true }));
    const plain = projectHeader(spaceOptions({}));

    expect(selected.backgroundColors).toContain(themeColors.selected);
    expect(elementsWithBorder(cursor, themeColors.accent)).toHaveLength(1);
    expect(plain.backgroundColors).not.toContain(themeColors.selected);
    expect(elementsWithBorder(plain, themeColors.accent)).toHaveLength(0);
  });

  test('a click on the header does not fold it', () => {
    let toggles = 0;

    const header = projectHeader(
      spaceOptions({
        onToggle: () => {
          toggles += 1;
        },
      }),
    );

    click(header);
    press(header, pressContext);

    expect(toggles).toBe(0);
  });

  test('shows the fold chevron only while hovered', () => {
    const hovered = projectHeader(spaceOptions({ hovered: true }));
    const still = projectHeader(spaceOptions({}));

    expect(drawnIcons(hovered)).toContain('chevron-down.svg');
    expect(drawnIcons(still)).not.toContain('chevron-down.svg');
    expect(drawnIcons(still)).not.toContain('chevron-right.svg');
  });

  test('keeps the hidden chevron slot at the size of the shown chevron, with no press', () => {
    const hovered = projectHeader(spaceOptions({ hovered: true }));
    const still = projectHeader(spaceOptions({}));
    const slot = still.kids.at(-1) as DrawnElement;

    expect(still.kids).toHaveLength(hovered.kids.length);
    expect(slot.styles['size']).toEqual(hovered.kids.at(-1)?.styles['size'] as unknown[]);
    expect(slot.mouseHandlers).toEqual({});
  });

  test('a press on the chevron toggles once and keeps the press from the header', () => {
    let toggles = 0;
    let stopped = 0;

    const header = projectHeader(
      spaceOptions({
        hovered: true,
        onToggle: () => {
          toggles += 1;
        },
      }),
    );

    const chevron = elementWithIcon(header, 'chevron-down.svg');
    const slot = header.kids.find((kid) => kid.kids.includes(chevron as DrawnElement));

    press(slot as DrawnElement, {
      stop_propagation: () => {
        stopped += 1;
      },
    });

    expect(toggles).toBe(1);
    expect(stopped).toBe(2);
  });

  test('a folded header shows the hidden count and the chevron without hover', () => {
    const header = projectHeader(spaceOptions({ folded: true, hidden: 3 }));

    expect(drawnTexts(header)).toContain('3 more');
    expect(drawnIcons(header)).toContain('chevron-right.svg');
  });
});
