import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import {
  drawn,
  drawnIcons,
  drawnTexts,
  drawnTooltips,
  elementsWithStyle,
  textColorOf,
  tipRow,
} from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import type { StackCardModel, StackCardPull } from './stackCard.ts';

const palette = {
  border: '#1a1a1a',
  foreground: '#3c3c4c',
  popover: '#4d4d4d',
  muted: '#6a6a6a',
  dim: '#7a7a7a',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './stackCard.ts';

const { stackCard, stackCardHeight } = (await import(modulePath)) as {
  stackCard: (model: StackCardModel) => DrawnElement;
  stackCardHeight: (model: StackCardModel) => number;
};

afterAll(() => {
  mock.restore();
});

const pull = (overrides: Partial<StackCardPull>): StackCardPull => ({
  number: null,
  ticket: null,
  title: 'Data layer',
  checkedOut: false,
  end: null,
  ...overrides,
});

const cardOf = (overrides: Partial<StackCardModel>): DrawnElement =>
  stackCard({
    title: 'Tau workflow sidebar',
    project: 'koja',
    merged: [],
    pulls: [],
    total: 0,
    ...overrides,
  });

const rowOf = (card: DrawnElement, text: string): DrawnElement => {
  const row = elementsWithStyle(card, 'h').find((element) => drawnTexts(element).includes(text));

  if (row === undefined) {
    throw new Error(`The card draws no row with ${text}.`);
  }

  return row;
};

describe('stackCard', () => {
  test('the merged line shows only when a pull merged', () => {
    const merged = cardOf({ merged: [502, 504], pulls: [pull({ number: 507 })], total: 3 });
    const open = cardOf({ pulls: [pull({ number: 507 })], total: 1 });
    const texts = drawnTexts(merged);

    expect(texts).toContain('#502 · #504');
    expect(texts).toContain('2 merged');
    expect(texts.indexOf('2 merged')).toBeLessThan(texts.indexOf('#507'));
    expect(drawnTexts(open)).not.toContain('0 merged');
  });

  test('the header leads with the title and then the project', () => {
    const card = cardOf({
      title: 'Tau workflow sidebar',
      project: 'koja',
      merged: [502],
      pulls: [pull({ number: 507 }), pull({ number: 509 })],
      total: 3,
    });

    const texts = drawnTexts(card);

    expect(texts.indexOf('Tau workflow sidebar')).toBeLessThan(texts.indexOf('koja'));
    expect(texts.indexOf('koja')).toBeLessThan(texts.indexOf('#502'));
    expect(texts.indexOf('#502')).toBeLessThan(texts.indexOf('#507'));
    expect(texts.indexOf('#507')).toBeLessThan(texts.indexOf('#509'));
  });

  test('the checked-out pull gets the branch mark', () => {
    const checkedOut = cardOf({ pulls: [pull({ number: 514, checkedOut: true })], total: 1 });
    const open = cardOf({ pulls: [pull({ number: 514 })], total: 1 });

    expect(drawnIcons(rowOf(checkedOut, '#514'))).toContain('git-branch.svg');
    expect(drawnIcons(rowOf(open, '#514'))).not.toContain('git-branch.svg');
  });

  test("a pull's end shows its need, else draft or closed, else nothing", () => {
    const card = cardOf({
      pulls: [
        pull({ number: 507, end: 'merge' }),
        pull({ number: 511, end: 'draft' }),
        pull({ number: 512, end: 'closed' }),
        pull({ number: 514, end: null }),
      ],
      total: 4,
    });

    expect(drawnTooltips(rowOf(card, '#507'))).toContain('Ready to merge');
    expect(drawnTexts(rowOf(card, '#511'))).toContain('draft');
    expect(drawnTexts(rowOf(card, '#512'))).toContain('closed');
    expect(drawnIcons(rowOf(card, '#514'))).toEqual([]);
    expect(drawnTooltips(rowOf(card, '#514'))).toEqual([]);
  });

  test('a draft or closed pull is muted', () => {
    const card = cardOf({
      pulls: [
        pull({ number: 507, title: 'Stack panel', end: 'merge' }),
        pull({ number: 511, title: 'Narrow rail', end: 'draft' }),
        pull({ number: 512, title: 'Keys', end: 'closed' }),
      ],
      total: 3,
    });

    expect(textColorOf(card, 'Stack panel')).toBe(palette.foreground);
    expect(textColorOf(card, 'Narrow rail')).toBe(palette.muted);
    expect(textColorOf(card, 'Keys')).toBe(palette.muted);
  });

  test('the footer counts every pull in the stack', () => {
    const card = cardOf({
      merged: [502, 504, 505],
      pulls: [pull({ number: 507 }), pull({ number: 509 })],
      total: 8,
    });

    expect(drawnTexts(card)).toContain('8 PRs');
    expect(drawnTexts(card)).not.toContain('5 PRs');
  });

  test('the footer says one PR for a stack of one pull', () => {
    const card = cardOf({ pulls: [pull({ number: 507 })], total: 1 });

    expect(drawnTexts(card)).toContain('1 PR');
  });

  test('the arrow sits at the middle of the height that centers the card', () => {
    const model: StackCardModel = {
      title: 'Tau workflow sidebar',
      project: 'koja',
      merged: [502],
      pulls: [pull({ number: 507 }), pull({ number: 509 })],
      total: 3,
    };

    const layers = elementsWithStyle(stackCard(model), 'top');
    const middle = stackCardHeight(model) / 2;

    expect(layers.map(tipRow)).toEqual([middle, middle]);
  });
});
