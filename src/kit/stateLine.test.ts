import { afterAll, describe, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface DrawnElement {
  children: DrawnElement[];
  path: string | null;
  spins: boolean;
  texts: string[];
}

interface StateLineOptions {
  kind: 'empty' | 'loading' | 'error';
  text: string;
  action?: DrawnElement;
}

const addChild = (parent: DrawnElement, child: unknown): void => {
  if (typeof child === 'string') {
    parent.texts.push(child);
  } else {
    parent.children.push(child as DrawnElement);
  }
};

const drawn = (path: string | null = null): DrawnElement => {
  const element: DrawnElement = { children: [], path, spins: false, texts: [] };

  const handle: DrawnElement = new Proxy(element, {
    get: (target, key) => {
      if (key === 'then') {
        return undefined;
      }

      if (key in target) {
        return target[key as keyof DrawnElement];
      }

      return (...args: unknown[]) => {
        if (key === 'child') {
          addChild(target, args[0]);
        }

        if (key === 'spin') {
          target.spins = true;
        }

        return handle;
      };
    },
  });

  return handle;
};

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.children.flatMap(descendants),
];

const drawnTexts = (element: DrawnElement): string[] =>
  descendants(element).flatMap((part) => part.texts);

const drawnIcons = (element: DrawnElement): string[] =>
  descendants(element)
    .map((part) => part.path?.split('/').at(-1) ?? null)
    .filter((name): name is string => name !== null);

const spinning = (element: DrawnElement): boolean =>
  descendants(element).some((part) => part.spins);

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
});
