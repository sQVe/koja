import { afterAll, describe, expect, mock, test } from 'bun:test';

import { click, clickablesWithText, drawn } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import { keyValueStore } from '../../../tests/keyValueStore.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { sidebarViewKey } from './sidebarView.ts';
import type { KeyValueStore } from './storage.ts';

const palette = {
  dim: '#2b2b3b',
  foreground: '#3c3c4c',
  muted: '#4d4d5d',
  selected: '#5e5e6e',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const kitFake = await realKitIndexFake(['size', 'viewSwitch']);

await mock.module('../../kit/index.ts', () => kitFake);

const modulePath = './viewBar.ts';

const { viewBar } = (await import(modulePath)) as {
  viewBar: (store: KeyValueStore, onChange: (cx: unknown) => void) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const optionButton = (element: DrawnElement, label: string): DrawnElement => {
  const option = clickablesWithText(element, label)[0];

  if (option === undefined) {
    throw new Error(`The view bar drew no ${label} option.`);
  }

  return option;
};

describe('viewBar', () => {
  test('the stored view is the active option', () => {
    const { store } = keyValueStore({ [sidebarViewKey]: 'inbox' });

    const element = viewBar(store, () => undefined);

    expect(optionButton(element, 'Projects').backgroundColors).toEqual([]);
    expect(optionButton(element, 'Inbox').backgroundColors).toEqual([palette.selected]);
  });

  test('an empty store makes Projects the active option', () => {
    const { store } = keyValueStore();

    const element = viewBar(store, () => undefined);

    expect(optionButton(element, 'Projects').backgroundColors).toEqual([palette.selected]);
    expect(optionButton(element, 'Inbox').backgroundColors).toEqual([]);
  });

  test('a select stores the chosen view', () => {
    const { values, store } = keyValueStore();

    const element = viewBar(store, () => undefined);

    const inbox = optionButton(element, 'Inbox');

    click(inbox);

    expect(values[sidebarViewKey]).toBe('inbox');
  });

  test('a select from a stored Inbox stores Projects', () => {
    const { values, store } = keyValueStore({ [sidebarViewKey]: 'inbox' });

    const element = viewBar(store, () => undefined);

    const projects = optionButton(element, 'Projects');

    click(projects);

    expect(values[sidebarViewKey]).toBe('projects');
  });

  test('a select asks for one redraw', () => {
    const { store } = keyValueStore();
    const changes: unknown[] = [];
    const context = { stop_propagation: () => undefined };

    const element = viewBar(store, (cx) => changes.push(cx));

    const inbox = optionButton(element, 'Inbox');

    click(inbox, context);

    expect(changes).toEqual([context]);
  });
});
