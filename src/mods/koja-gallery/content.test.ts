import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { Element } from 'gpui-kit';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { clickablesWithText, drawn, drawnTexts, spinning } from '../../../tests/drawn.ts';
import {
  chainable,
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';

interface SampleOptions {
  folded?: ReadonlySet<string>;
  checksRetried?: boolean;
  onToggle?: (name: string) => void;
  onRetryChecks?: () => void;
}

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    h_flex: () => drawn(),
    v_flex: () => drawn(),
    InputState: { new: () => chainable() },
  }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ shared: () => undefined, theme: () => ({}) }));

const kitFake = await realKitIndexFake([
  'age',
  'button',
  'contentSection',
  'dialog',
  'factRows',
  'hoverCard',
  'icon',
  'iconNames',
  'itemHeader',
  'listRow',
  'partNote',
  'popupSurface',
  'projectHeader',
  'roleBadge',
  'searchField',
  'sectionHeader',
  'size',
  'sourceLink',
  'spaceFooter',
  'stackProgress',
  'stateLine',
  'statusMark',
  'statusRow',
  'tab',
  'text',
  'textField',
  'textRole',
  'theme',
  'viewSwitch',
  'workIcon',
]);

await mock.module('../../kit/index.ts', () => kitFake);

const { contentParts } = (await import('./content.ts')) as unknown as {
  contentParts: (options: Required<SampleOptions>) => Element[];
};

afterAll(() => {
  mock.restore();
});

const samples = (options: SampleOptions = {}): DrawnElement[] => {
  const drawnParts = contentParts({
    folded: options.folded ?? new Set(),
    checksRetried: options.checksRetried ?? false,
    onToggle: options.onToggle ?? (() => undefined),
    onRetryChecks: options.onRetryChecks ?? (() => undefined),
  });

  return drawnParts as unknown as DrawnElement[];
};

const sampleNamed = (label: string, options: SampleOptions = {}): DrawnElement => {
  const found = samples(options).find((sample) => drawnTexts(sample).includes(label));

  if (found === undefined) {
    throw new Error(`The gallery has no sample named ${label}.`);
  }

  return found;
};

const headerOf = (sample: DrawnElement, name: string): DrawnElement => {
  const [header] = clickablesWithText(sample, name);

  if (header === undefined) {
    throw new Error(`The sample has no foldable ${name} header.`);
  }

  return header;
};

describe('gallery content samples', () => {
  test('the stale Checks sample keeps its rows, note, and still marks', () => {
    const stale = sampleNamed('Checks section with stale rows');
    const live = sampleNamed('Checks section with live rows');

    const staleTexts = drawnTexts(stale);
    const liveTexts = drawnTexts(live);

    expect(staleTexts).toContain('Could not sync checks · showing checks from 6m ago');
    expect(staleTexts).toContain('started 8m ago');
    expect(staleTexts).not.toContain('started 2m ago');
    expect(spinning(stale)).toBe(false);

    expect(liveTexts).toContain('started 2m ago');
    expect(liveTexts.some((text) => text.startsWith('Could not sync'))).toBe(false);
    expect(spinning(live)).toBe(true);
  });

  test('the stale Checks sample reads fresh again once the part is retried', () => {
    const retried = sampleNamed('Checks section with stale rows', { checksRetried: true });
    const texts = drawnTexts(retried);

    expect(texts.some((text) => text.startsWith('Could not sync'))).toBe(false);
    expect(texts).toContain('started 2m ago');
  });

  test('a folded section keeps its header and drops its rows', () => {
    const folded = sampleNamed('Checks section with stale rows', { folded: new Set(['Checks']) });
    const texts = drawnTexts(folded);

    expect(texts).toContain('Checks');
    expect(texts).not.toContain('typecheck');
    expect(texts).not.toContain('Could not sync checks · showing checks from 6m ago');
  });

  test('a section header reports its fold to the gallery', () => {
    const toggled: string[] = [];

    const sample = sampleNamed('Checks section with stale rows', {
      onToggle: (name) => {
        toggled.push(name);
      },
    });

    headerOf(sample, 'Checks').clickHandlers[0]?.({}, { stop_propagation: () => undefined });

    expect(toggled).toEqual(['Checks']);
  });

  test('the part note reports its retry to the gallery', () => {
    let retries = 0;

    const sample = sampleNamed('Checks section with stale rows', {
      onRetryChecks: () => {
        retries += 1;
      },
    });

    const [retry] = clickablesWithText(sample, 'Retry');

    if (retry === undefined) {
      throw new Error('The stale Checks sample has no Retry.');
    }

    retry.clickHandlers[0]?.({}, { stop_propagation: () => undefined });

    expect(retries).toBe(1);
  });
});
