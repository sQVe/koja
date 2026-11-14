import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { Status } from 'herdr';

import type { DrawnElement } from '../../tests/drawn.ts';
import {
  click,
  drawn,
  drawnIcons,
  drawnTexts,
  elementWithIcon,
  elementWithText,
  elementsWithBorder,
  press,
  spinning,
} from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface HeaderBase {
  name: string;
  machine?: string;
  folded: boolean;
  hidden: number;
  hovered: boolean;
  onToggle: () => void;
}

interface FoldHeaderOptions extends HeaderBase {
  kind: 'fold';
}

interface SpaceHeaderOptions extends HeaderBase {
  kind: 'space';
  status: Status | null;
  age: string | null;
  selected: boolean;
  cursor: boolean;
  dragged: boolean;
}

type HeaderOptions = FoldHeaderOptions | SpaceHeaderOptions;

const themeColors = {
  accent: '#000000',
  foreground: '#111111',
  muted: '#222222',
  selected: '#333333',
  border: '#444444',
  idle: '#555555',
  dim: '#666666',
  working: '#777777',
  blocked: '#888888',
  done: '#999999',
};

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
  hovered: false,
  onToggle: () => undefined,
};

afterAll(() => {
  mock.restore();
});

const spaceOptions = (overrides: Partial<SpaceHeaderOptions>): SpaceHeaderOptions => ({
  kind: 'space',
  name: 'koja',
  folded: false,
  hidden: 0,
  hovered: false,
  onToggle: () => undefined,
  status: null,
  age: null,
  selected: false,
  cursor: false,
  dragged: false,
  ...overrides,
});

const pressContext = { stop_propagation: () => undefined };

const nameIndex = (header: DrawnElement): number =>
  header.kids.findIndex((kid) => drawnTexts(kid).includes('koja'));

const namePlacement = (header: DrawnElement): unknown[] => [
  header.styles['pl'],
  header.styles['mx'],
  header.styles['gap'],
  ...header.kids.slice(0, nameIndex(header)).map((kid) => kid.styles),
];

const startSlot = (header: DrawnElement): DrawnElement => header.kids[0] as DrawnElement;

const lastSlot = (header: DrawnElement): DrawnElement => header.kids.at(-1) as DrawnElement;

const lastSlotIcons = (header: DrawnElement): string[] => drawnIcons(lastSlot(header));

const nameColor = (header: DrawnElement): string | undefined =>
  elementWithText(header, 'koja')?.textColors.at(-1);

describe('projectHeader', () => {
  test('remote headers show the machine and server icon only when supplied', () => {
    const remote = projectHeader({ ...options, machine: 'build-box' });
    const local = projectHeader(options);

    expect(drawnTexts(remote)).toContain('build-box');
    expect(drawnIcons(remote)).toContain('server.svg');
    expect(drawnTexts(local)).toEqual(['koja']);
    expect(drawnIcons(local)).not.toContain('server.svg');
  });

  test('only folded headers show the hidden count', () => {
    const folded = projectHeader({ ...options, folded: true });
    const open = projectHeader(options);

    expect(drawnTexts(folded)).toContain('2 more');
    expect(drawnTexts(open)).not.toContain('2 more');
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

  test('reserves the mark slot, so its name lines up with a main space header', () => {
    const fold = projectHeader(options);
    const space = projectHeader(spaceOptions({}));

    expect(nameIndex(fold)).toBe(1);
    expect(namePlacement(fold)).toEqual(namePlacement(space));
  });

  test('draws its name in the muted tone, while a main space header keeps foreground', () => {
    expect(nameColor(projectHeader(options))).toBe(themeColors.muted);
    expect(nameColor(projectHeader(spaceOptions({})))).toBe(themeColors.foreground);
  });

  test('a folded header ends with the count, then chevron-right in the last slot', () => {
    const header = projectHeader({ ...options, folded: true });

    expect(drawnTexts(header)).toEqual(['koja', '2 more']);
    expect(lastSlotIcons(header)).toEqual(['chevron-right.svg']);
  });

  test('an open header shows chevron-down in the last slot only while hovered', () => {
    const hovered = projectHeader({ ...options, hovered: true });
    const still = projectHeader(options);

    expect(lastSlotIcons(hovered)).toEqual(['chevron-down.svg']);
    expect(lastSlotIcons(still)).toEqual([]);
    expect(still.kids).toHaveLength(hovered.kids.length);
    expect(lastSlot(still).styles['size']).toEqual(lastSlot(hovered).styles['size'] as unknown[]);
  });
});

describe('projectHeader for a main space', () => {
  test.each(['working', 'blocked', 'done'] as const)(
    'shows the %s mark of its main space before the project name',
    (status) => {
      const header = projectHeader(spaceOptions({ status }));
      const slot = startSlot(header);
      const shown = spinning(slot) || drawnIcons(slot).length > 0;

      expect(shown).toBe(true);
      expect(nameIndex(header)).toBe(1);
    },
  );

  const quietAgents: [string, Status | null][] = [
    ['idle', 'idle'],
    ['without an agent', null],
  ];

  for (const [label, status] of quietAgents) {
    test(`keeps an empty mark slot of the same width when its main space is ${label}`, () => {
      const header = projectHeader(spaceOptions({ status }));
      const working = projectHeader(spaceOptions({ status: 'working' }));
      const slot = startSlot(header);

      expect(slot.kids).toEqual([]);
      expect(slot.styles['w']).toEqual(startSlot(working).styles['w'] as unknown[]);
      expect(nameIndex(header)).toBe(1);
    });
  }

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

  test('shows chevron-down in the last slot only while hovered', () => {
    const hovered = projectHeader(spaceOptions({ hovered: true }));
    const still = projectHeader(spaceOptions({}));

    expect(lastSlotIcons(hovered)).toEqual(['chevron-down.svg']);
    expect(drawnIcons(still)).not.toContain('chevron-down.svg');
    expect(drawnIcons(still)).not.toContain('chevron-right.svg');
  });

  test('keeps the hidden chevron slot at the size of the shown chevron, with no press', () => {
    const hovered = projectHeader(spaceOptions({ hovered: true }));
    const still = projectHeader(spaceOptions({}));
    const slot = lastSlot(still);

    expect(still.kids).toHaveLength(hovered.kids.length);
    expect(slot.styles['size']).toEqual(lastSlot(hovered).styles['size'] as unknown[]);
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

  test('a folded header ends with the count, the age, then chevron-right in the last slot', () => {
    const header = projectHeader(spaceOptions({ folded: true, hidden: 3, age: '4m' }));

    expect(drawnTexts(header)).toEqual(['koja', '3 more', '4m']);
    expect(lastSlotIcons(header)).toEqual(['chevron-right.svg']);
  });

  test('draws no age when it has none', () => {
    expect(drawnTexts(projectHeader(spaceOptions({})))).toEqual(['koja']);
  });
});
