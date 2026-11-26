import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { click, clickablesWithText, drawnTexts, spinning } from '../../../tests/drawn.ts';
import { mockGalleryModules } from '../../../tests/gallery.ts';

interface SampleOptions {
  folded?: ReadonlySet<string>;
  checksRetried?: boolean;
  onToggle?: (name: string) => void;
  onRetryChecks?: () => void;
}

Object.assign(globalThis, { kojaModName: 'koja' });

const kitFake = await mockGalleryModules({ shared: () => undefined });

await mock.module('../../kit/index.ts', () => kitFake);

const { contentParts } = await import('./content.ts');

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

  // The kit draws native elements; the fakes record them as drawn elements.
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

    expect(staleTexts.some((text) => text.includes('6m ago'))).toBe(true);
    expect(clickablesWithText(stale, 'Retry')).toHaveLength(1);
    expect(staleTexts).toContain('typecheck');
    expect(staleTexts).toContain('started 8m ago');
    expect(staleTexts).toContain('started 7m ago');
    expect(staleTexts).not.toContain('started 2m ago');
    expect(spinning(stale)).toBe(false);

    expect(liveTexts).toContain('started 2m ago');
    expect(clickablesWithText(live, 'Retry')).toEqual([]);
    expect(spinning(live)).toBe(true);
  });

  test('the stale Checks sample reads fresh again once the part is retried', () => {
    const retried = sampleNamed('Checks section with stale rows', { checksRetried: true });
    const texts = drawnTexts(retried);

    expect(clickablesWithText(retried, 'Retry')).toEqual([]);
    expect(texts).toContain('started 2m ago');
  });

  test('a folded section keeps its header and drops its rows', () => {
    const folded = sampleNamed('Checks section with stale rows', {
      folded: new Set(['Checks with stale rows']),
    });

    const texts = drawnTexts(folded);

    expect(texts).toContain('Checks');
    expect(texts).not.toContain('typecheck');
    expect(clickablesWithText(folded, 'Retry')).toEqual([]);
  });

  test('a section header reports its fold to the gallery', () => {
    const toggled: string[] = [];

    const sample = sampleNamed('Checks section with stale rows', {
      onToggle: (name) => {
        toggled.push(name);
      },
    });

    click(headerOf(sample, 'Checks'));

    expect(toggled).toEqual(['Checks with stale rows']);
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

    click(retry);

    expect(retries).toBe(1);
  });
});
