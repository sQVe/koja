import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { click, drawn } from '../../../tests/drawn.ts';
import {
  chainable,
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { listOf, numberOf, recordOf, stringOf } from '../../kit/fields.ts';
import { newMenuOpenKey } from '../../kit/newMenu.ts';
import { overlaySize, spacing } from '../../kit/size.ts';

const storage = new Map<string, string>();
let activePanel = 'files';
let actions: { name: string; args: unknown }[] = [];
let shownTabs: string[] = [];
let overlaySpecs: Record<string, unknown>[] = [];
let sharedWrites: { key: string; value: unknown }[] = [];
let sharedValues: Record<string, unknown> = {};
let zoom = 1;
let plusButton: DrawnElement | null = null;
let toggleStates: boolean[] = [];
let layoutReads = 0;

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
    iconToggle: (options: { active: boolean }) => {
      toggleStates.push(options.active);
      plusButton = drawn();

      return plusButton;
    },
    overlaySize,
    spacing,
    indicator: chainable,
    layoutRoot: () => {
      layoutReads += 1;

      return {};
    },
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
  plusButton = null;
  toggleStates = [];
  layoutReads = 0;
});

describe('tabs layout reads', () => {
  test('parses the layout once for one render', () => {
    const view = new loaded.default();

    view.render();

    expect(layoutReads).toBe(1);
  });
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

const pressedPlus = (): DrawnElement => {
  expect(plusButton).not.toBeNull();

  return plusButton ?? drawn();
};

// A press in the middle of a 22 px button whose right edge sits at x 212 and bottom at y 32.
const pressPlus = (event: Record<string, unknown> = {}): void => {
  const plus = pressedPlus();

  for (const handler of plus.mouseHandlers['on_mouse_down:left'] ?? []) {
    handler(
      {
        position: { x: 212 - 11, y: 32 - 11 },
        local_position: { x: 11, y: 11 },
        bounds: { width: 22, height: 22 },
        ...event,
      },
      context,
    );
  }
};

const clickPlus = (): void => {
  click(pressedPlus());
};

describe('the new menu button', () => {
  test('opens the menu under the plus at its own size', () => {
    const view = new loaded.default();

    view.render();
    pressPlus();
    clickPlus();

    expect(overlaySpecs).toEqual([
      {
        mod: 'koja-new-menu',
        kind: 'popup',
        frame: 'none',
        width: overlaySize.newMenuWidth,
        height: overlaySize.wideMenuHeight,
        at: { x: 212 - overlaySize.newMenuWidth, y: 32 + spacing.xsmall },
      },
    ]);
  });

  test('opens the menu under the plus at twice the zoom', () => {
    zoom = 2;

    const view = new loaded.default();

    view.render();
    pressPlus();
    clickPlus();

    const [opened] = overlaySpecs;

    expect(opened?.['at']).toEqual({
      x: 212 - 2 * overlaySize.newMenuWidth,
      y: 32 + 2 * spacing.xsmall,
    });
  });

  test('opens the menu at the pointer when the press carried no box', () => {
    const view = new loaded.default();

    view.render();
    pressPlus({ bounds: undefined, local_position: undefined });
    clickPlus();

    expect(overlaySpecs).toEqual([
      {
        mod: 'koja-new-menu',
        kind: 'popup',
        frame: 'none',
        width: overlaySize.newMenuWidth,
        height: overlaySize.wideMenuHeight,
      },
    ]);
  });

  test('draws the plus pressed while the menu is open', () => {
    sharedValues[newMenuOpenKey] = true;

    new loaded.default().render();

    expect(toggleStates).toEqual([true]);
  });

  test('clears a pressed plus left by a session that ended with the menu open', () => {
    sharedValues[newMenuOpenKey] = true;

    new loaded.default().init(null, context);

    expect(sharedWrites).toEqual([{ key: newMenuOpenKey, value: false }]);
  });

  test('leaves the shared state alone when no menu was open at the last end', () => {
    new loaded.default().init(null, context);

    expect(sharedWrites).toEqual([]);
  });
});
