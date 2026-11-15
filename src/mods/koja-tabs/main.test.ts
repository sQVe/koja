import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import {
  chainable,
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { listOf, numberOf, recordOf, stringOf } from '../../kit/fields.ts';

const storage = new Map<string, string>();
let activePanel = 'files';
let actions: { name: string; args: unknown }[] = [];
let shownTabs: string[] = [];

Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  },
});

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: chainable }));
await mock.module('gpui-kit', () => gpuiKitFake({ div: chainable }));

await mock.module('herdr', () =>
  herdrFake({
    spaces: () => [{ id: 'space-1', active: true, tabs: [{ id: 'tab-1', active: true }] }],
    run: (name: string, args: unknown) => {
      actions.push({ name, args });
    },
  }),
);

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    colors: () => ({}),
    findLayoutNode: (id: string) => {
      if (id === 'panel') {
        return { hidden: false };
      }

      if (id === 'panel-body') {
        return { active: activePanel, children: [{ id: 'files' }, { id: 'changes' }] };
      }

      return null;
    },
    icon: chainable,
    iconButton: chainable,
    indicator: chainable,
    layoutRoot: () => ({}),
    listOf,
    numberOf,
    recordOf,
    stringOf,
    tab: ({ label }: { label: string }) => {
      shownTabs.push(label);

      return chainable();
    },
    tabLabel: (tab: { id: string }) => tab.id,
    tabProgram: () => null,
    toggleButton: chainable,
    trafficLightsPadding: () => 0,
  }),
);

const modulePath = './main.ts';
const loaded = (await import(modulePath)) as { default: new () => { render: () => unknown } };

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  storage.clear();
  activePanel = 'files';
  actions = [];
  shownTabs = [];
});

describe('tabs saved panels', () => {
  test('recovers from invalid saved JSON and persists the current panel', () => {
    storage.set('panels', '{{{not json');

    const view = new loaded.default();

    view.render();

    expect(shownTabs).toEqual(['tab-1']);
    expect(actions).toEqual([]);
    expect(storage.get('panels')).toBe('{"space-1":"files"}');

    activePanel = 'changes';
    view.render();

    expect(storage.get('panels')).toBe('{"space-1":"changes"}');
  });

  test('restores a valid saved panel', () => {
    storage.set('panels', '{"space-1":"changes"}');

    const view = new loaded.default();

    view.render();

    expect(shownTabs).toEqual(['tab-1']);

    expect(actions).toEqual([
      { name: 'layout.select', args: { stack: 'panel-body', child: 'changes' } },
      { name: 'layout.show', args: { id: 'panel' } },
    ]);

    expect(storage.get('panels')).toBe('{"space-1":"changes"}');
  });
});
