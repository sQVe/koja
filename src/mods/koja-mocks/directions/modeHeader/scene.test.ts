import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts, elementWithText } from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';

type ModeSceneName = 'insert' | 'normal' | 'pending' | 'split' | 'split-normal' | 'lone';
type HeaderFit = 'full' | 'taskDropped' | 'folderShort' | 'branchCut' | 'folderDropped';
type PaneFocus = { focused: false } | { focused: true; pending: string[] };

interface FakePane {
  name: string;
  task?: string;
  branch?: string;
  folder: string;
  status: 'working' | 'blocked' | 'idle' | 'done' | null;
  lines: string[];
}

interface Expected {
  name: ModeSceneName;
  mode: 'Insert' | 'Normal';
  pending: string[];
  focused: FakePane;
  // The focused header's task, branch, and folder texts at its width in the scene.
  focusedFields: string[];
  unfocused: FakePane[];
}

interface Tokens {
  pane: { border: string; cardBorder: string; focusedBorder: string; focusedHeaderFill: string };
  controls: { toggleFill: string };
  marks: { idle: string };
}

type DrawingMethod = (...values: unknown[]) => unknown;

const styleCalls = new WeakMap<DrawnElement, Set<string>>();

// The shared fake keeps no layout calls, so this one also records the name of every call.
const styledElement = (path: string | null = null): DrawnElement => {
  const element = drawn(path) as DrawnElement & Record<string, unknown>;
  const calls = new Set<string>();

  const handle: DrawnElement = new Proxy(element, {
    get: (target, key) => {
      if (typeof key !== 'string') {
        return undefined;
      }

      const value = target[key];

      if (typeof value !== 'function') {
        return value;
      }

      const method = value as DrawingMethod;

      return (...values: unknown[]) => {
        calls.add(key);
        method(...values);

        return handle;
      };
    },
  });

  styleCalls.set(handle, calls);

  return handle;
};

const hasStyle = (element: DrawnElement | undefined, name: string): boolean =>
  element !== undefined && (styleCalls.get(element)?.has(name) ?? false);

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => styledElement(), v_flex: () => styledElement() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => styledElement() }));

await mock.module('herdr', () => herdrFake());

await mock.module('../../../../kit/index.ts', () =>
  kitIndexFake({ icon: (name: string) => styledElement(name) }),
);

// Loaded by path, so the root typecheck does not follow them into source that needs Herdr's types.
const scenePath = './scene.ts';
const panePath = './pane.ts';
const dataPath = './data.ts';
const windowPath = '../window.ts';
const kojaPath = '../koja.ts';
const contentPath = '../../scenes/shellContent.ts';

const { modeScene } = (await import(scenePath)) as {
  modeScene: (name: ModeSceneName) => DrawnElement;
};

const { modePane } = (await import(panePath)) as {
  modePane: (
    fakePane: FakePane,
    look: { focus: PaneFocus; fit: HeaderFit },
    tokens: Tokens,
  ) => DrawnElement;
};

const { reviewPane } = (await import(dataPath)) as { reviewPane: FakePane };

const { directionWindow } = (await import(windowPath)) as {
  directionWindow: (tokens: unknown) => DrawnElement;
};

const { koja, kojaNormal } = (await import(kojaPath)) as { koja: Tokens; kojaNormal: Tokens };

const { agentPane, shellPane } = (await import(contentPath)) as {
  agentPane: FakePane;
  shellPane: FakePane;
};

afterAll(() => {
  mock.restore();
});

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

const headerOf = (window: DrawnElement, fakePane: FakePane): DrawnElement | undefined =>
  descendants(window).find(
    (part) =>
      part.kids.some((kid) => kid.texts.includes(fakePane.name)) &&
      drawnIcons(part).includes('ellipsis'),
  );

const headerTexts = (window: DrawnElement, fakePane: FakePane): string[] => {
  const header = headerOf(window, fakePane);

  return header === undefined ? [] : drawnTexts(header).filter((text) => text !== '');
};

const parentOf = (
  window: DrawnElement,
  child: DrawnElement | undefined,
): DrawnElement | undefined =>
  descendants(window).find((part) => part.kids.some((kid) => kid === child));

const paneCard = (window: DrawnElement, fakePane: FakePane): DrawnElement | undefined =>
  parentOf(window, headerOf(window, fakePane));

const changesCard = (window: DrawnElement): DrawnElement | undefined =>
  descendants(window).find((part) =>
    part.kids.some((kid) => kid.kids.some((field) => field.texts.includes('Changes'))),
  );

const fullFields = (fakePane: FakePane): string[] =>
  [fakePane.task, fakePane.branch, fakePane.folder].filter((field) => field !== undefined);

const changesToggleFills = (window: DrawnElement): string[][] =>
  descendants(window)
    .filter((part) => part.kids.some((kid) => kid.path === 'git-compare'))
    .map((part) => part.backgroundColors);

const keycapsOf = (header: DrawnElement | undefined, keys: string[]): DrawnElement[] =>
  descendants(header ?? drawn()).filter((part) => part.texts.some((text) => keys.includes(text)));

const branch = agentPane.branch ?? '';
const shortShell = { focused: agentPane, focusedFields: [branch, 'koja'], unfocused: [shellPane] };

const scenes: Expected[] = [
  { name: 'insert', mode: 'Insert', pending: [], ...shortShell },
  { name: 'normal', mode: 'Normal', pending: [], ...shortShell },
  { name: 'pending', mode: 'Normal', pending: ['3', 's'], ...shortShell },
  {
    name: 'split',
    mode: 'Insert',
    pending: [],
    focused: reviewPane,
    focusedFields: fullFields(reviewPane),
    unfocused: [agentPane, shellPane],
  },
  {
    name: 'split-normal',
    mode: 'Normal',
    pending: ['g'],
    focused: agentPane,
    focusedFields: [branch, agentPane.folder],
    unfocused: [reviewPane, shellPane],
  },
  {
    name: 'lone',
    mode: 'Insert',
    pending: [],
    focused: agentPane,
    focusedFields: fullFields(agentPane),
    unfocused: [],
  },
];

const normalScenes = scenes.filter((scene) => scene.mode === 'Normal');
const zshScenes = scenes.filter((scene) => scene.unfocused.includes(shellPane));

const panesOf = (expected: Expected): FakePane[] => [expected.focused, ...expected.unfocused];

const modeLabels = (texts: string[]): string[] =>
  texts.filter((text) => text === 'Insert' || text === 'Normal');

const unfocused: PaneFocus = { focused: false };

const narrowed = (fit: HeaderFit, focus: PaneFocus = unfocused): DrawnElement =>
  modePane(agentPane, { focus, fit }, kojaNormal);

const paneTexts = (pane: DrawnElement): string[] =>
  drawnTexts(pane.kids[0] ?? drawn()).filter((text) => text !== '');

describe('the mode header scenes', () => {
  test.each(scenes)(
    'header-mode-$name shows the mode, one text per pending key, then the pane fields',
    (expected) => {
      expect(headerTexts(modeScene(expected.name), expected.focused)).toEqual([
        expected.mode,
        ...expected.pending,
        expected.focused.name,
        ...expected.focusedFields,
      ]);
    },
  );

  test.each(scenes)('header-mode-$name shows only the pane fields when unfocused', (expected) => {
    const window = modeScene(expected.name);

    for (const fakePane of expected.unfocused) {
      expect(headerTexts(window, fakePane)).toEqual([fakePane.name, ...fullFields(fakePane)]);
    }
  });

  test.each(scenes)('header-mode-$name draws each header above its terminal body', (expected) => {
    const window = modeScene(expected.name);

    for (const fakePane of panesOf(expected)) {
      const parts = paneCard(window, fakePane)?.kids ?? [];

      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe(headerOf(window, fakePane));
      expect(hasStyle(parts[0], 'border_b')).toBe(true);
      expect(drawnTexts(parts[1] ?? drawn())).toEqual(fakePane.lines);
    }
  });

  test.each(scenes)(
    'header-mode-$name draws the program icon first and the overflow button last',
    (expected) => {
      const window = modeScene(expected.name);

      for (const fakePane of panesOf(expected)) {
        const icons = drawnIcons(headerOf(window, fakePane) ?? drawn());

        expect(icons.at(0)).toBe('terminal');
        expect(icons.at(-1)).toBe('ellipsis');
      }
    },
  );

  test.each(scenes)(
    'header-mode-$name draws its one mode label outside the tab bar',
    (expected) => {
      expect(modeLabels(drawnTexts(modeScene(expected.name)))).toEqual([expected.mode]);
    },
  );

  test('the direction scenes keep their tab bar mode pill', () => {
    expect(modeLabels(drawnTexts(directionWindow(koja)))).toEqual(['Insert']);
    expect(modeLabels(drawnTexts(directionWindow(kojaNormal)))).toEqual(['Normal']);
  });

  test.each(normalScenes)(
    'header-mode-$name draws the accent border on the focused pane only',
    (expected) => {
      const window = modeScene(expected.name);

      expect(paneCard(window, expected.focused)?.borderColors).toEqual([
        kojaNormal.pane.focusedBorder,
      ]);

      for (const fakePane of expected.unfocused) {
        expect(paneCard(window, fakePane)?.borderColors).toEqual([kojaNormal.pane.cardBorder]);
      }
    },
  );

  test.each(['normal', 'pending'] as const)(
    'header-mode-%s keeps the faint outline on the Changes panel',
    (name) => {
      expect(changesCard(modeScene(name))?.borderColors).toEqual([kojaNormal.pane.cardBorder]);
    },
  );

  test('direction-koja-normal keeps the accent border on every pane and panel', () => {
    const window = directionWindow(kojaNormal);

    expect(kojaNormal.pane.border).not.toBe(kojaNormal.pane.cardBorder);
    expect(paneCard(window, shellPane)?.borderColors).toEqual([kojaNormal.pane.border]);
    expect(changesCard(window)?.borderColors).toEqual([kojaNormal.pane.border]);
  });

  test.each(zshScenes)('header-mode-$name draws the idle dot for the zsh pane', (expected) => {
    const parts = headerOf(modeScene(expected.name), shellPane)?.kids ?? [];
    const statusSlot = parts.at(-2) ?? drawn();
    const tokens = expected.mode === 'Normal' ? kojaNormal : koja;

    expect(drawnIcons(statusSlot)).toEqual([]);
    expect(statusSlot.kids.map((mark) => mark.backgroundColors)).toEqual([[tokens.marks.idle]]);
  });

  test('direction-koja keeps the zsh status slot empty', () => {
    const parts = headerOf(directionWindow(koja), shellPane)?.kids ?? [];

    expect(parts.at(-2)?.kids).toEqual([]);
  });

  test.each([
    { scene: 'split', fakePane: agentPane, icons: ['loader-circle'] },
    { scene: 'split', fakePane: reviewPane, icons: ['check'] },
  ] as const)(
    'header-mode-$scene draws the status of $fakePane.name directly before its button',
    ({ scene, fakePane, icons }) => {
      const parts = headerOf(modeScene(scene), fakePane)?.kids ?? [];

      expect(drawnIcons(parts.at(-2) ?? drawn())).toEqual([...icons]);
    },
  );

  test('the pending keys 3 and s draw as two outlined keycaps after the mode tag', () => {
    const header = headerOf(modeScene('pending'), agentPane);
    const keycaps = keycapsOf(header, ['3', 's']);

    expect(keycaps.map((keycap) => keycap.texts)).toEqual([['3'], ['s']]);

    expect(keycaps.map((keycap) => keycap.borderColors)).toEqual([
      [kojaNormal.pane.cardBorder],
      [kojaNormal.pane.cardBorder],
    ]);

    expect(drawnTexts(header?.kids[1] ?? drawn())).toEqual(['3', 's']);
  });

  test('header-mode-pending cuts the branch to make room for the keycaps', () => {
    const cutIn = (name: ModeSceneName): boolean => {
      const header = headerOf(modeScene(name), agentPane) ?? drawn();

      return hasStyle(elementWithText(header, branch) ?? undefined, 'text_ellipsis_middle');
    };

    expect(cutIn('pending')).toBe(true);
    expect(cutIn('normal')).toBe(false);
  });

  test('the pending key g draws as one keycap', () => {
    const header = headerOf(modeScene('split-normal'), agentPane);

    expect(keycapsOf(header, ['g'])).toHaveLength(1);
  });

  test('a header without pending keys draws no keycap group', () => {
    const header = headerOf(modeScene('normal'), agentPane);

    expect(drawnIcons(header?.kids[1] ?? drawn())).toEqual(['terminal']);
  });

  test.each(['full', 'taskDropped', 'folderShort', 'branchCut', 'folderDropped'] as const)(
    'a %s header keeps the mode tag and the keycaps at their width',
    (fit) => {
      const header = narrowed(fit, { focused: true, pending: ['3', 's'] }).kids[0];
      const mode = elementWithText(header ?? drawn(), 'Normal');

      expect(hasStyle(mode ?? undefined, 'flex_none')).toBe(true);
      expect(hasStyle(header?.kids[1], 'flex_none')).toBe(true);

      for (const keycap of keycapsOf(header, ['3', 's'])) {
        expect(hasStyle(keycap, 'flex_none')).toBe(true);
      }
    },
  );

  test('a full header shows the task, the branch, and the whole folder', () => {
    expect(paneTexts(narrowed('full'))).toEqual([agentPane.name, ...fullFields(agentPane)]);
  });

  test('the task gives way first', () => {
    expect(paneTexts(narrowed('taskDropped'))).toEqual([agentPane.name, branch, agentPane.folder]);
  });

  test('the folder shortens to its last segment before the branch cuts', () => {
    const pane = narrowed('folderShort');
    const branchLabel = elementWithText(pane, branch);

    expect(paneTexts(pane)).toEqual([agentPane.name, branch, 'koja']);
    expect(hasStyle(branchLabel ?? undefined, 'flex_none')).toBe(true);
    expect(hasStyle(branchLabel ?? undefined, 'text_ellipsis_middle')).toBe(false);
  });

  test('the branch cuts in its middle while the short folder stays', () => {
    const pane = narrowed('branchCut');
    const branchLabel = elementWithText(pane, branch);

    expect(paneTexts(pane)).toEqual([agentPane.name, branch, 'koja']);
    expect(hasStyle(branchLabel ?? undefined, 'text_ellipsis_middle')).toBe(true);
    expect(hasStyle(branchLabel ?? undefined, 'flex_none')).toBe(false);
  });

  test('the folder drops last, with the branch still cut', () => {
    const pane = narrowed('folderDropped');

    expect(paneTexts(pane)).toEqual([agentPane.name, branch]);
    expect(hasStyle(elementWithText(pane, branch) ?? undefined, 'text_ellipsis_middle')).toBe(true);
  });

  test('normal mode tints the focused header and no other header', () => {
    const window = modeScene('split-normal');

    expect(headerOf(window, agentPane)?.backgroundColors).toEqual([
      kojaNormal.pane.focusedHeaderFill,
    ]);

    expect(headerOf(window, shellPane)?.backgroundColors).toEqual([]);
    expect(headerOf(window, reviewPane)?.backgroundColors).toEqual([]);
  });

  test('insert mode tints no header', () => {
    expect(headerOf(modeScene('split'), reviewPane)?.backgroundColors).toEqual([]);
  });

  test('the Insert label draws without a border', () => {
    const insert = elementWithText(modeScene('insert'), 'Insert');

    expect(insert?.borderColors).toEqual([]);
  });

  test('the Insert and Normal labels draw different fills', () => {
    const insert = elementWithText(modeScene('insert'), 'Insert')?.backgroundColors;
    const normal = elementWithText(modeScene('normal'), 'Normal')?.backgroundColors;

    expect(insert).toHaveLength(1);
    expect(normal).toHaveLength(1);
    expect(insert).not.toEqual(normal);
  });

  test.each([
    { name: 'insert', fill: koja.controls.toggleFill },
    { name: 'normal', fill: kojaNormal.controls.toggleFill },
    { name: 'pending', fill: kojaNormal.controls.toggleFill },
  ] as const)('header-mode-$name marks the Changes toggle as active', ({ name, fill }) => {
    expect(changesToggleFills(modeScene(name))).toEqual([[fill]]);
  });

  test.each(['insert', 'normal', 'pending'] as const)(
    'header-mode-%s draws the Changes title row above its list',
    (name) => {
      const texts = drawnTexts(modeScene(name));

      expect(texts.indexOf('Changes')).toBeGreaterThan(-1);
      expect(texts.indexOf('Changes')).toBeLessThan(texts.indexOf('src/kit/paneHeader.ts'));
    },
  );

  test.each(['split', 'split-normal', 'lone'] as const)(
    'header-mode-%s draws no Changes panel and an inactive toggle',
    (name) => {
      const window = modeScene(name);

      expect(drawnTexts(window)).not.toContain('Changes');
      expect(changesToggleFills(window)).toEqual([[]]);
    },
  );

  test('the lone scene draws one terminal pane', () => {
    const window = modeScene('lone');

    expect(headerOf(window, shellPane)).toBeUndefined();
    expect(headerOf(window, reviewPane)).toBeUndefined();
  });

  test('the split stacks the agent pane above the shell pane, beside the review pane', () => {
    const window = modeScene('split');
    const texts = drawnTexts(window);
    const firstLineOf = (fakePane: FakePane): number => texts.indexOf(fakePane.lines.at(0) ?? '');

    const stack = descendants(window).find(
      (part) =>
        part.kids.length === 2 &&
        headerOf(part.kids[0] ?? drawn(), agentPane) !== undefined &&
        headerOf(part.kids[1] ?? drawn(), shellPane) !== undefined,
    );

    expect(stack).toBeDefined();
    expect(headerOf(stack ?? drawn(), reviewPane)).toBeUndefined();
    expect(firstLineOf(reviewPane)).toBeGreaterThan(firstLineOf(shellPane));
  });
});
