import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts, drawnTooltips, spinning } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface StateLineOptions {
  kind: 'empty' | 'loading' | 'error';
  text: string;
  id?: string;
  action?: DrawnElement;
}

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => ({ foreground: '#000000' }) }));

// A path in a variable keeps the typechecker of tests away from the gpui modules.
const modulePath = './stateLine.ts';

const loaded = (await import(modulePath)) as {
  stateLine: (options: StateLineOptions) => DrawnElement;
};

const render = loaded.stateLine;

afterAll(() => {
  mock.restore();
});

describe('stateLine', () => {
  test('an empty state shows its text with no icon and no spinner', () => {
    const line = render({ kind: 'empty', text: 'No uncommitted changes' });

    expect(drawnTexts(line)).toEqual(['No uncommitted changes']);
    expect(drawnIcons(line)).toEqual([]);
  });

  test('a loading state shows a spinning loader beside its text', () => {
    const line = render({ kind: 'loading', text: 'Loading changes…' });

    expect(drawnTexts(line)).toEqual(['Loading changes…']);
    expect(drawnIcons(line)).toEqual(['loader-circle.svg']);
    expect(spinning(line)).toBe(true);
  });

  test('an error state shows the alert icon beside its text', () => {
    const line = render({ kind: 'error', text: 'Could not read git status.' });

    expect(drawnTexts(line)).toEqual(['Could not read git status.']);
    expect(drawnIcons(line)).toEqual(['circle-alert.svg']);
    expect(spinning(line)).toBe(false);
  });

  test('an action shows after the text', () => {
    const action = drawn();

    action.texts.push('Retry');

    const line = render({ kind: 'error', text: 'Could not read git status.', action });

    expect(drawnTexts(line)).toEqual(['Could not read git status.', 'Retry']);
  });

  test('a line with an id shows its whole text as a tooltip, so a cut line stays readable', () => {
    const text = 'koja PRs are 6m old.';
    const line = render({ kind: 'error', text, id: 'koja-pulls-error' });

    expect(drawnTooltips(line)).toEqual([text]);
  });

  test('a line without an id shows no tooltip', () => {
    const line = render({ kind: 'error', text: 'Could not read git status.' });

    expect(drawnTooltips(line)).toEqual([]);
  });
});
