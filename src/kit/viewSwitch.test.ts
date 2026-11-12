import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { click, clickablesWithText, drawn } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface ViewSwitchOptions {
  options: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
}

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

const modulePath = './viewSwitch.ts';

const { viewSwitch } = (await import(modulePath)) as {
  viewSwitch: (options: ViewSwitchOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const views = [
  { id: 'projects', label: 'Projects' },
  { id: 'inbox', label: 'Inbox' },
];

const optionButton = (element: DrawnElement, label: string): DrawnElement | undefined =>
  clickablesWithText(element, label)[0];

describe('viewSwitch', () => {
  test('only the active option draws the selected fill', () => {
    const element = viewSwitch({ options: views, active: 'inbox', onSelect: () => undefined });

    expect(optionButton(element, 'Projects')?.backgroundColors).toEqual([]);
    expect(optionButton(element, 'Inbox')?.backgroundColors).toEqual([palette.selected]);
  });

  test('a click on the other option selects its id', () => {
    const selected: string[] = [];

    const element = viewSwitch({
      options: views,
      active: 'projects',
      onSelect: (id) => selected.push(id),
    });

    const inbox = optionButton(element, 'Inbox');

    if (inbox !== undefined) {
      click(inbox);
    }

    expect(selected).toEqual(['inbox']);
  });
});
