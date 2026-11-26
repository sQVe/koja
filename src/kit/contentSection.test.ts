import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { Element } from 'gpui-kit';

import type { DrawnElement } from '../../tests/drawn.ts';
import {
  click,
  drawn,
  drawnIcons,
  drawnTexts,
  elementWithText,
  numberStyle,
} from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import type { ContentSectionOptions } from './contentSection.ts';
import type { PartNoteOptions } from './partNote.ts';
import type { StatusRowOptions } from './statusRow.ts';

const palette = {
  ansi3: '#0a0a1a',
  blocked: '#0b0b1b',
  border: '#1c1c2c',
  dim: '#2d2d3d',
  done: '#3e3e4e',
  foreground: '#4f4f5f',
  idle: '#5a5a6a',
  muted: '#6b6b7b',
  working: '#7c7c8c',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './contentSection.ts';

const { contentSection } = (await import(modulePath)) as {
  contentSection: (options: ContentSectionOptions) => DrawnElement;
};

const { partNote } = (await import('./partNote.ts')) as {
  partNote: (options: PartNoteOptions) => Element;
};

const { statusRow } = (await import('./statusRow.ts')) as {
  statusRow: (options: StatusRowOptions) => Element;
};

afterAll(() => {
  mock.restore();
});

const headerOf = (section: DrawnElement): DrawnElement => section.kids[0] as DrawnElement;

const labelEdge = (section: DrawnElement): number => {
  const header = headerOf(section);

  return numberStyle(header, 'pl') + numberStyle(header.kids[0], 'w') + numberStyle(header, 'gap');
};

const openChecks: ContentSectionOptions = {
  name: 'Checks',
  count: 3,
  open: true,
  parts: [
    partNote({ part: 'checks', age: '6m ago' }),
    statusRow({ mark: 'failing', name: 'typecheck', detail: 'Type mismatch', state: 'failing' }),
  ],
};

describe('contentSection', () => {
  test('an open section draws its name, its count, and every part', () => {
    expect(drawnTexts(contentSection(openChecks))).toEqual([
      'Checks',
      '3',
      'Could not sync checks · showing checks from 6m ago',
      'Retry',
      'typecheck',
      'failing',
      'Type mismatch',
    ]);

    expect(drawnIcons(contentSection(openChecks))[0]).toBe('chevron-down.svg');
  });

  test('a folded section draws its header only', () => {
    const section = contentSection({
      name: 'Files',
      count: 9,
      open: false,
      parts: openChecks.parts,
    });

    expect(drawnTexts(section)).toEqual(['Files', '9']);
    expect(drawnIcons(section)).toEqual(['chevron-right.svg']);
  });

  test('the count follows the name in the dim ink, with nothing at the right edge', () => {
    const section = contentSection({
      name: 'Checks',
      count: 3,
      open: false,
      parts: openChecks.parts,
    });

    const header = headerOf(section);
    const labelGroup = header.kids.find((kid) => drawnTexts(kid).includes('Checks'));

    if (labelGroup === undefined) {
      throw new Error('The header draws no label group.');
    }

    expect(header.kids.at(-1)).toBe(labelGroup);
    expect(drawnTexts(labelGroup)).toEqual(['Checks', '3']);
    expect(elementWithText(section, '3')?.textColors).toEqual([palette.dim]);
  });

  test('a section without a count draws its name alone', () => {
    expect(
      drawnTexts(contentSection({ name: 'Description', open: false, parts: openChecks.parts })),
    ).toEqual(['Description']);
  });

  test('the header folds the section and the body keeps no press of its own', () => {
    let toggles = 0;

    const section = contentSection({
      ...openChecks,
      onToggle: () => {
        toggles += 1;
      },
    });

    const header = headerOf(section);
    const body = section.kids[1] as DrawnElement;

    click(header);
    click(body);

    expect(toggles).toBe(1);
    expect(section.clickHandlers).toEqual([]);
  });

  test('a part note starts its text at the label edge', () => {
    const section = contentSection(openChecks);
    const note = section.kids[1] as DrawnElement;

    const noteEdge =
      numberStyle(note, 'pl') + numberStyle(note.kids[0], 'w') + numberStyle(note, 'gap');

    expect(noteEdge).toBe(labelEdge(section));
  });

  test('a status row starts its name at the label edge', () => {
    const section = contentSection(openChecks);
    const row = section.kids[2] as DrawnElement;
    const frame = row.kids[0] as DrawnElement;

    const rowEdge =
      numberStyle(frame, 'mx') +
      numberStyle(frame, 'border') +
      numberStyle(frame, 'pl') +
      numberStyle(frame.kids[0], 'w') +
      numberStyle(frame, 'gap');

    expect(rowEdge).toBe(labelEdge(section));
  });

  test('a status row detail line starts at the same edge as its name', () => {
    const section = contentSection(openChecks);
    const row = section.kids[2] as DrawnElement;
    const detail = row.kids[1] as DrawnElement;

    expect(numberStyle(detail, 'pl')).toBe(labelEdge(section));
  });
});
