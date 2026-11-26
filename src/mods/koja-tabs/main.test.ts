import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import {
  chainable,
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { listOf, numberOf, recordOf, stringOf } from '../../kit/fields.ts';
import { overlaySize, spacing } from '../../kit/size.ts';

const storage = new Map<string, string>();
let activePanel = 'files';
let actions: { name: string; args: unknown }[] = [];
let shownTabs: string[] = [];
let overlaySpecs: Record<string, unknown>[] = [];
let sharedWrites: { key: string; value: unknown }[] = [];
let sharedValues: Record<string, unknown> = {};
let zoom = 1;
let plusPress: ((event: unknown, cx: unknown) => void) | null = null;
let plusClick: (() => void) | null = null;

const plusButton = (): unknown => {
  const element: unknown = new Proxy(() => undefined, {
    get: (_target, key) => {
      if (key === 'on_mouse_down') {
        return (_button: string, handler: (event: unknown, cx: unknown) => void) => {
          plusPress = handler;

          return element;
        };
      }

      if (key === 'on_click') {
        return (handler: () => void) => {
          plusClick = handler;

          return element;
        };
      }

      if (key === 'then') {
        return undefined;
      }

      return () => element;
    },
    apply: () => element,
  });

  return element;
};

const context = { notify: () => undefined, stop_propagation: () => undefined };

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
    openOverlay: (spec: Record<string, unknown>) => {
      overlaySpecs.push(spec);

      return 'overlay-1';
    },
    run: (name: string, args: unknown) => {
      actions.push({ name, args });
    },
    setShared: (key: string, value: unknown) => {
      sharedWrites.push({ key, value });

      return null;
    },
    settings: () => ({ zoom }),
    shared: (key: string) => sharedValues[key],
    spaces: () => [{ id: 'space-1', active: true, tabs: [{ id: 'tab-1', active: true }] }],
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
    iconToggle: () => plusButton(),
    overlaySize,
    spacing,
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

const loaded = (await import(modulePath)) as {
  default: new () => {
    init: (props: unknown, cx: unknown) => void;
    render: () => unknown;
  };
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  storage.clear();
  activePanel = 'files';
  actions = [];
  shownTabs = [];
  overlaySpecs = [];
  sharedWrites = [];
  sharedValues = {};
  zoom = 1;
  plusPress = null;
  plusClick = null;
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

describe('the new menu button', () => {
  test('opens the menu under the plus, scaled by the app zoom', () => {
    zoom = 1.25;

    const view = new loaded.default();

    view.render();

    plusPress?.(
      {
        position: { x: 200, y: 20 },
        local_position: { x: 10, y: 10 },
        bounds: { width: 22, height: 22 },
      },
      context,
    );

    plusClick?.();

    expect(overlaySpecs).toEqual([
      {
        mod: 'koja-new-menu',
        kind: 'popup',
        frame: 'none',
        width: overlaySize.newMenuWidth,
        height: overlaySize.wideMenuHeight,
        at: { x: 212 - overlaySize.newMenuWidth * zoom, y: 32 + spacing.xsmall * zoom },
      },
    ]);
  });

  test('clears a pressed plus left by a session that ended with the menu open', () => {
    sharedValues['koja-new-menu.open'] = true;

    const view = new loaded.default();

    view.init(null, context);

    expect(sharedWrites).toEqual([{ key: 'koja-new-menu.open', value: false }]);
  });
});
