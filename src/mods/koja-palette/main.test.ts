import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  click,
  drawn,
  drawnTexts,
  elementAroundText,
  elementsWithStyle,
} from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import type { KeyBinding } from '../../kit/shortcutBinding.ts';
import { spacing } from '../../kit/size.ts';
import { groupSpace, headSize, listHeight, rowSize } from './viewport.ts';

type KeyHandler = (
  event: { key: string },
  cx: { stop_propagation: () => void; notify: () => void },
) => void;

type ChangeHandler = (event: unknown, cx: { notify: () => void }) => void;

interface CatalogCommand {
  name: string;
  args: { name: string; required: boolean }[];
  about: string;
}

interface FakeView {
  init: (props: unknown, cx: unknown) => void;
  render: () => unknown;
  close: () => void;
}

// The build defines this global for each mod; the kit reads it when it loads.
Object.assign(globalThis, { kojaModName: 'koja' });

const storage = new Map<string, string>();

Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  },
});

const fillerCommands = Array.from({ length: 65 }, (_item, index) => ({
  name: `filler.extra${index}`,
  args: [],
  about: '',
}));

const defaultCommands: CatalogCommand[] = [
  { name: 'tab.new', args: [], about: '' },
  { name: 'tab.close', args: [], about: '' },
  ...fillerCommands,
];

let catalogCommands: CatalogCommand[] = defaultCommands;

let changeInput: ChangeHandler | null = null;
let inputValue = '';
let closeOverlayCalls = 0;
let sharedValues: Record<string, unknown> = {};
let sharedWrites: string[] = [];
let chosenCommands: string[] = [];
let chosenArgs: (Record<string, unknown> | undefined)[] = [];
let prompts: Record<string, unknown>[] = [];
let submitInput: (() => void) | null = null;
let keyBindings: KeyBinding[] = [];
let homeDirectory = '';
let themeList: { name: string; light: boolean; colors: Record<string, string> }[] = [];
let appearanceSetting = 'light';
let paletteNotifications = 0;
let tasks: Promise<void>[] = [];

const inputStub = {
  on: (event: string, handler: (() => void) | ChangeHandler) => {
    if (event === 'submit') {
      submitInput = handler as () => void;
    }

    if (event === 'change') {
      changeInput = handler;
    }
  },
  focus: () => undefined,
  value: () => inputValue,
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    Input: { new: () => drawn() },
    InputState: { new: () => inputStub },
    h_flex: () => drawn(),
    v_flex: () => drawn(),
  }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({
    div: () => drawn(),
    svg: (path: string) => drawn(path),
  }),
);

await mock.module('herdr', () =>
  herdrFake({
    appHome: () => homeDirectory,
    commands: () => catalogCommands,
    settings: () => ({ appearance: appearanceSetting }),
    themes: () => themeList,
    keys: () => keyBindings,
    layouts: () => [],
    openOverlay: () => 'overlay-2',
    run: () => null,
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;
      sharedWrites.push(key);

      return null;
    },
    shared: (key: string) => sharedValues[key],
    theme: () => ({ foreground: '#111111' }),
  }),
);

const { overlayCloseCount, recordOverlayClose } = await import('../../kit/overlay/open.ts');

const realKit = await realKitIndexFake([
  'icon',
  'keycap',
  'listRow',
  'overlay/card',
  'overlay/heading',
  'overlay/lines',
  'overlay/row',
  'overlay/scrollThumb',
  'popupSurface',
  'shortcut',
  'size',
  'stateLine',
  'text',
  'textRole',
  'theme',
  'themes',
]);

await mock.module('../../kit/index.ts', () => ({
  ...realKit,
  askFirst: (name: string, args?: Record<string, unknown>) => {
    chosenCommands.push(name);
    chosenArgs.push(args);
  },
  openPrompt: (dialog: Record<string, unknown>) => {
    prompts.push(dialog);
  },
  closeOverlay: () => {
    closeOverlayCalls += 1;
  },
  currentWindow: () => null,
  mainColumnInsets: () => ({ left: 268, top: 34 }),
  mainColumnPlacement: () => ({ left: 260, right: 8, top: 66 }),
  recordOverlayClose,
}));

const loadView = async (): Promise<FakeView> => {
  const modulePath = './main.ts';

  const loaded = (await import(modulePath)) as { default: new () => FakeView };

  return new loaded.default();
};

const asyncContext = {
  focus_handle: () => ({ focus: () => undefined, is_focused: () => false }),
  notify: () => {
    paletteNotifications += 1;
  },
  spawn: (body: (cx: unknown) => Promise<void>) => {
    tasks.push(body(asyncContext));
  },
  timer: { after: () => undefined },
};

const openPalette = async (): Promise<FakeView> => {
  const view = await loadView();

  view.init(undefined, asyncContext);
  await Promise.all(tasks);

  return view;
};

const homes: string[] = [];

const homeWithPalette = async (mod: string, palette: unknown[]): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), 'koja-palette-'));

  homes.push(home);

  const directory = join(home, 'mods', mod);

  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'main.js'), '');
  await writeFile(join(directory, 'mod.json'), JSON.stringify({ palette }));

  return home;
};

const drawnWords = (element: DrawnElement): string[] =>
  drawnTexts(element).map((text) => text.replaceAll('\u00A0', ' '));

const rowIdOf = (element: DrawnElement): string => {
  const [id] = element.styles['id'] ?? [];

  return typeof id === 'string' ? id : '';
};

const rowWithText = (tree: DrawnElement, text: string): DrawnElement | null =>
  elementsWithStyle(tree, 'id')
    .filter((element) => rowIdOf(element).startsWith('palette-row-'))
    .find((element) => drawnWords(element).some((words) => words.includes(text))) ?? null;

const renderTree = (view: FakeView): DrawnElement => view.render() as DrawnElement;

const setQuery = (query: string): void => {
  inputValue = query;
  changeInput?.({}, { notify: () => undefined });
};

const keyDownHandlerOf = (tree: DrawnElement): KeyHandler | null => {
  const [element] = elementsWithStyle(tree, 'on_key_down');

  return (element?.styles['on_key_down']?.[0] as KeyHandler | undefined) ?? null;
};

const rowOf = (tree: DrawnElement, index: number): DrawnElement | null =>
  elementsWithStyle(tree, 'id').find(
    (element) => element.styles['id']?.[0] === `palette-row-${index}`,
  ) ?? null;

const keycapLabelsOf = (element: DrawnElement): string[] =>
  elementsWithStyle(element, 'font_family').flatMap((glyph) => drawnTexts(glyph));

const rowKeycaps = (tree: DrawnElement, index: number): string[] => {
  const row = rowOf(tree, index);

  return row === null ? [] : keycapLabelsOf(row);
};

const thumbsOf = (tree: DrawnElement): DrawnElement[] =>
  elementsWithStyle(tree, 'right').filter(
    (element) => element.styles['right']?.[0] === -spacing.xsmall,
  );

const headingKeycaps = (tree: DrawnElement, label: string): string[] => {
  const heading = elementAroundText(tree, label);

  return heading === null ? [] : keycapLabelsOf(heading);
};

afterAll(async () => {
  mock.restore();

  for (const home of homes.splice(0)) {
    await rm(home, { recursive: true, force: true });
  }
});

beforeEach(() => {
  changeInput = null;
  inputValue = '';
  closeOverlayCalls = 0;
  sharedValues = {};
  sharedWrites = [];
  chosenCommands = [];
  chosenArgs = [];
  prompts = [];
  storage.clear();
  submitInput = null;
  keyBindings = [];
  catalogCommands = defaultCommands;
  homeDirectory = '';
  themeList = [];
  appearanceSetting = 'light';
  paletteNotifications = 0;
  tasks = [];
});

describe('palette overlay state', () => {
  test('recovers from invalid saved JSON and persists a selected command', async () => {
    storage.set('recent', '{{{not json');

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();
    submitInput?.();

    expect(chosenCommands).toEqual(['tab.new']);
    expect(storage.get('recent')).toBe('["tab.new:{}"]');
  });

  test('reads valid saved recent commands before the default ordering', async () => {
    storage.set('recent', '["tab.close:{}"]');

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();
    submitInput?.();

    expect(chosenCommands).toEqual(['tab.close']);
    expect(storage.get('recent')).toBe('["tab.close:{}"]');
  });

  test('opening the palette writes no shared state', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);

    expect(sharedWrites).toEqual([]);
    expect(overlayCloseCount()).toBe(0);
  });

  test('escape records one close and closes the palette', async () => {
    const view = await openPalette();
    const handler = keyDownHandlerOf(renderTree(view));

    handler?.({ key: 'escape' }, { stop_propagation: () => undefined, notify: () => undefined });

    expect(overlayCloseCount()).toBe(1);
    expect(closeOverlayCalls).toBe(1);
  });

  test('tracks focus on the card that handles keys', async () => {
    const view = await openPalette();
    const tree = renderTree(view);

    const card = elementsWithStyle(tree, 'id').find(
      (element) => element.styles['id']?.[0] === 'palette',
    );

    const backdrop = elementsWithStyle(tree, 'id').find(
      (element) => element.styles['id']?.[0] === 'palette-backdrop',
    );

    expect(card?.styles['track_focus']).toHaveLength(1);
    expect(backdrop?.styles['track_focus']).toBeUndefined();
  });

  test('closing the view records one close', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.close();

    expect(overlayCloseCount()).toBe(1);
  });

  test('a repeated close adds another count', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.close();
    view.close();

    expect(overlayCloseCount()).toBe(2);
  });
});

describe('palette footer count', () => {
  test('draws the count of every command for an empty query', async () => {
    const view = await openPalette();

    expect(drawnTexts(renderTree(view))).toContain('67 commands');
  });

  test('draws the match count after a query', async () => {
    const view = await openPalette();

    setQuery('close');

    expect(drawnTexts(renderTree(view))).toContain('1 match');
  });
});

describe('palette headings', () => {
  test('draws a heading for each shown group before a query', async () => {
    const view = await openPalette();
    const texts = drawnTexts(renderTree(view));

    expect(texts).toContain('Tabs');
    expect(texts).toContain('Filler');
  });

  test('draws no heading after a query', async () => {
    const view = await openPalette();

    setQuery('close');
    const texts = drawnTexts(renderTree(view));

    expect(texts).not.toContain('Tabs');
    expect(texts).not.toContain('Filler');
  });

  test('draws the part keycap only in the heading that has one', async () => {
    const view = await openPalette();
    const tree = renderTree(view);

    expect(headingKeycaps(tree, 'Tabs')).toEqual(['t']);
    expect(headingKeycaps(tree, 'Filler')).toEqual([]);
  });
});

describe('palette hints', () => {
  test('draws the normal-mode keycaps on the rows', async () => {
    sharedValues = { 'koja-modal': true };

    const view = await openPalette();
    const tree = renderTree(view);

    expect(rowKeycaps(tree, 0)).toEqual(['t', 'n']);
    expect(rowKeycaps(tree, 1)).toEqual(['t', 'q']);
  });

  test('draws the insert-mode keycaps on the rows', async () => {
    keyBindings = [
      { section: 'global', keys: 'ctrl-t', action: 'tab.new' },
      { section: 'global', keys: 'ctrl-q', action: 'tab.close' },
    ];

    const view = await openPalette();
    const tree = renderTree(view);

    expect(rowKeycaps(tree, 0)).toEqual(['Ctrl+T']);
    expect(rowKeycaps(tree, 1)).toEqual(['Ctrl+Q']);
  });
});

describe('palette scroll thumb', () => {
  test('draws a thumb when the list overflows', async () => {
    const view = await openPalette();

    expect(thumbsOf(renderTree(view))).toHaveLength(1);
  });

  test('draws the thumb at the height of the rows, headings, and group spaces', async () => {
    const view = await openPalette();
    const [thumb] = thumbsOf(renderTree(view));

    const headings = new Set(catalogCommands.map((command) => command.name.split('.')[0])).size;

    const total =
      catalogCommands.length * rowSize + headings * headSize + (headings - 1) * groupSpace;

    const expected = Math.max(spacing.xxlarge, (listHeight * listHeight) / total);

    expect(thumb?.styles['h']?.[0]).toBeCloseTo(expected);
  });

  test('draws no thumb when the list fits', async () => {
    const view = await openPalette();

    setQuery('close');

    expect(thumbsOf(renderTree(view))).toEqual([]);
  });
});

describe('mod palettes', () => {
  const withCommand = (name: string, args: { name: string; required: boolean }[] = []): void => {
    catalogCommands = [...defaultCommands, { name, args, about: '' }];
  };

  const resizeArgs = [
    { name: 'id', required: true },
    { name: 'px', required: true },
  ];

  const resizeEntry = {
    title: 'Widen',
    command: 'layout.resize',
    args: { id: 'sidebar', px: 240 },
  };

  test('lists an entry a mod declares in its manifest', async () => {
    withCommand('layout.resize', resizeArgs);
    homeDirectory = await homeWithPalette('koja-gallery', [resizeEntry]);

    const view = await openPalette();

    expect(drawnTexts(renderTree(view))).toContain('Widen');
  });

  test('keeps the palette usable and redraws when the mod palettes cannot be read', async () => {
    homeDirectory = {
      toString: () => {
        throw new Error('unreadable');
      },
    } as unknown as string;

    const before = paletteNotifications;
    const view = await openPalette();

    expect(paletteNotifications).toBeGreaterThan(before);
    expect(rowWithText(renderTree(view), 'New tab')).not.toBeNull();
  });

  test('runs an entry with the arguments its mod declared', async () => {
    withCommand('layout.resize', resizeArgs);
    homeDirectory = await homeWithPalette('koja-gallery', [resizeEntry]);

    const view = await openPalette();
    const row = rowWithText(renderTree(view), 'Widen');

    if (row !== null) {
      click(row);
    }

    expect(chosenCommands).toEqual(['layout.resize']);
    expect(chosenArgs).toEqual([{ id: 'sidebar', px: 240 }]);
  });

  test('duplicates the layout the entry names', async () => {
    withCommand('layout.clone', [{ name: 'name', required: false }]);
    sharedValues['layout'] = 'other';

    homeDirectory = await homeWithPalette('koja-gallery', [
      { title: 'Copy main', command: 'layout.clone', args: { name: 'main' } },
    ]);

    const view = await openPalette();
    const row = rowWithText(renderTree(view), 'Copy main');

    if (row !== null) {
      click(row);
    }

    expect(chosenCommands).toEqual(['layout.clone']);
    expect(chosenArgs).toEqual([{ name: 'main' }]);
  });

  test('asks which mod to duplicate when the entry names none', async () => {
    withCommand('mod.clone', [{ name: 'name', required: false }]);

    const view = await openPalette();
    const row = rowWithText(renderTree(view), 'Duplicate mod');

    if (row !== null) {
      click(row);
    }

    expect(prompts).toHaveLength(1);
    expect(chosenCommands).toEqual([]);
  });

  test('duplicates the mod the entry names instead of asking', async () => {
    withCommand('mod.clone', [{ name: 'name', required: false }]);

    homeDirectory = await homeWithPalette('koja-gallery', [
      { title: 'Copy gallery', command: 'mod.clone', args: { name: 'koja-gallery' } },
    ]);

    const view = await openPalette();
    const row = rowWithText(renderTree(view), 'Copy gallery');

    if (row !== null) {
      click(row);
    }

    expect(prompts).toEqual([]);
    expect(chosenCommands).toEqual(['mod.clone']);
    expect(chosenArgs).toEqual([{ name: 'koja-gallery' }]);
  });

  test('draws the key of a JSON action on its row', async () => {
    withCommand('app.theme');
    appearanceSetting = 'dark';
    themeList = [{ name: 'graphite', light: false, colors: {} }];

    keyBindings = [
      {
        section: 'global',
        keys: 'ctrl-alt-t',
        action: '{"command":"app.theme","args":{"name":"graphite"}}',
      },
    ];

    const view = await openPalette();
    const row = rowWithText(renderTree(view), 'Theme: graphite');
    const labels = row === null ? [] : keycapLabelsOf(row);

    expect(labels).toEqual(['Ctrl+Alt+T']);
  });

  test("offers the themes of the window's appearance", async () => {
    withCommand('app.theme');

    themeList = [
      { name: 'graphite', light: false, colors: {} },
      { name: 'catppuccin-latte', light: true, colors: {} },
    ];

    appearanceSetting = 'dark';
    const darkTree = renderTree(await openPalette());

    expect(rowWithText(darkTree, 'Theme: graphite')).not.toBeNull();
    expect(rowWithText(darkTree, 'Theme: catppuccin latte')).toBeNull();

    appearanceSetting = 'light';
    const lightTree = renderTree(await openPalette());

    expect(rowWithText(lightTree, 'Theme: catppuccin latte')).not.toBeNull();
    expect(rowWithText(lightTree, 'Theme: graphite')).toBeNull();
  });
});
