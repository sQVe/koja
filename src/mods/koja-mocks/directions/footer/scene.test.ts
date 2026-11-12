import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts, elementWithText } from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';

type FooterSceneName = 'insert' | 'normal' | 'pending' | 'split' | 'split-normal' | 'lone';

interface FakePane {
  name: string;
  task?: string;
  branch?: string;
  folder: string;
  status: 'working' | 'blocked' | 'idle' | 'done' | null;
  lines: string[];
}

interface Expected {
  name: FooterSceneName;
  mode: 'Insert' | 'Normal';
  pending: string | null;
  focused: FakePane;
  unfocused: FakePane[];
  // Panes whose row is too narrow for the task, and those too narrow for the folder as well.
  noTask: FakePane[];
  noFolder: FakePane[];
}

interface Tokens {
  pane: { focusedHeaderFill: string };
  controls: { toggleFill: string };
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
const dataPath = './data.ts';
const windowPath = '../window.ts';
const kojaPath = '../koja.ts';
const contentPath = '../../scenes/shellContent.ts';

const { modeScene } = (await import(scenePath)) as {
  modeScene: (name: FooterSceneName, position: 'top' | 'bottom') => DrawnElement;
};

const footerScene = (name: FooterSceneName): DrawnElement => modeScene(name, 'bottom');
const headerScene = (name: FooterSceneName): DrawnElement => modeScene(name, 'top');

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

const footerOf = (window: DrawnElement, fakePane: FakePane): DrawnElement | undefined =>
  descendants(window).find(
    (part) =>
      part.kids.some((kid) => kid.texts.includes(fakePane.name)) &&
      drawnIcons(part).includes('ellipsis'),
  );

const footerTexts = (window: DrawnElement, fakePane: FakePane): string[] => {
  const footer = footerOf(window, fakePane);

  return footer === undefined ? [] : drawnTexts(footer).filter((text) => text !== '');
};

const paneFields = (fakePane: FakePane, expected: Expected): string[] => {
  const fields = [fakePane.name];

  const task = expected.noTask.includes(fakePane) ? undefined : fakePane.task;

  if (task !== undefined) {
    fields.push(task);
  }

  if (fakePane.branch !== undefined) {
    fields.push(fakePane.branch);
  }

  if (!expected.noFolder.includes(fakePane)) {
    fields.push(fakePane.folder);
  }

  return fields;
};

const focusedFields = (expected: Expected): string[] => {
  const keys = expected.pending === null ? [] : [expected.pending];

  return [expected.mode, ...keys, ...paneFields(expected.focused, expected)];
};

const statusIcons = (fakePane: FakePane): string[] => {
  if (fakePane.status === 'working') {
    return ['loader-circle'];
  }

  return fakePane.status === 'done' ? ['check'] : [];
};

const changesToggleFills = (window: DrawnElement): string[][] =>
  descendants(window)
    .filter((part) => part.kids.some((kid) => kid.path === 'git-compare'))
    .map((part) => part.backgroundColors);

const shellScene = { focused: agentPane, unfocused: [shellPane], noTask: [agentPane] };

const scenes: Expected[] = [
  { name: 'insert', mode: 'Insert', pending: null, ...shellScene, noFolder: [] },
  { name: 'normal', mode: 'Normal', pending: null, ...shellScene, noFolder: [] },
  { name: 'pending', mode: 'Normal', pending: '3s', ...shellScene, noFolder: [agentPane] },
  {
    name: 'split',
    mode: 'Insert',
    pending: null,
    focused: reviewPane,
    unfocused: [agentPane, shellPane],
    noTask: [],
    noFolder: [],
  },
  {
    name: 'split-normal',
    mode: 'Normal',
    pending: 'g',
    focused: agentPane,
    unfocused: [reviewPane, shellPane],
    noTask: [agentPane],
    noFolder: [],
  },
  {
    name: 'lone',
    mode: 'Insert',
    pending: null,
    focused: agentPane,
    unfocused: [],
    noTask: [],
    noFolder: [],
  },
];

const panesOf = (expected: Expected): FakePane[] => [expected.focused, ...expected.unfocused];

// The card parts of a pane: its chrome row and its terminal body, in drawing order.
const paneParts = (window: DrawnElement, fakePane: FakePane): DrawnElement[] => {
  const chrome = footerOf(window, fakePane);
  const paneCard = descendants(window).find((part) => part.kids.some((kid) => kid === chrome));

  return paneCard?.kids ?? [];
};

const modeLabels = (texts: string[]): string[] =>
  texts.filter((text) => text === 'Insert' || text === 'Normal');

const sorted = (window: DrawnElement): string[] => drawnTexts(window).toSorted();

describe('the pane footer scenes', () => {
  test.each(scenes)(
    'footer-$name shows the mode, then the pending keys, then the pane fields in the focused footer',
    (expected) => {
      const window = footerScene(expected.name);

      expect(footerTexts(window, expected.focused)).toEqual(focusedFields(expected));
    },
  );

  test.each(scenes)(
    'footer-$name shows only the pane fields in an unfocused footer',
    (expected) => {
      const window = footerScene(expected.name);

      for (const fakePane of expected.unfocused) {
        expect(footerTexts(window, fakePane)).toEqual(paneFields(fakePane, expected));
      }
    },
  );

  test.each(scenes)(
    'footer-$name draws the program icon first and the overflow button last in every footer',
    (expected) => {
      const window = footerScene(expected.name);

      for (const fakePane of [expected.focused, ...expected.unfocused]) {
        const footer = footerOf(window, fakePane);
        const icons = footer === undefined ? [] : drawnIcons(footer);

        expect(icons.at(0)).toBe('terminal');
        expect(icons.at(-1)).toBe('ellipsis');
      }
    },
  );

  test.each([
    { status: 'working', scene: 'split', fakePane: agentPane },
    { status: 'done', scene: 'split', fakePane: reviewPane },
    { status: 'empty', scene: 'split', fakePane: shellPane },
    { status: 'working', scene: 'lone', fakePane: agentPane },
  ] as const)(
    'footer-$scene draws the $status status of $fakePane.name directly before its button',
    ({ scene, fakePane }) => {
      const parts = footerOf(footerScene(scene), fakePane)?.kids ?? [];
      const statusSlot = parts.at(-2) ?? drawn('missing');

      expect(drawnTexts(statusSlot)).toEqual([]);
      expect(drawnIcons(statusSlot)).toEqual(statusIcons(fakePane));
    },
  );

  test.each([
    { name: 'insert', fill: koja.controls.toggleFill },
    { name: 'normal', fill: kojaNormal.controls.toggleFill },
    { name: 'pending', fill: kojaNormal.controls.toggleFill },
  ] as const)('footer-$name marks the Changes toggle as active', ({ name, fill }) => {
    expect(changesToggleFills(footerScene(name))).toEqual([[fill]]);
  });

  test.each(['split', 'split-normal', 'lone'] as const)(
    'footer-%s draws the Changes toggle without the active fill',
    (name) => {
      expect(changesToggleFills(footerScene(name))).toEqual([[]]);
    },
  );

  test.each(scenes)('footer-$name draws each footer after its terminal body', (expected) => {
    const window = footerScene(expected.name);

    for (const fakePane of panesOf(expected)) {
      const parts = paneParts(window, fakePane);

      expect(parts).toHaveLength(2);
      expect(drawnTexts(parts[0] ?? drawn())).toEqual(fakePane.lines);
      expect(parts[1]).toBe(footerOf(window, fakePane));
    }
  });

  test.each(scenes)(
    'header-mode-$name draws each chrome row before its terminal body',
    (expected) => {
      const window = headerScene(expected.name);

      for (const fakePane of panesOf(expected)) {
        const parts = paneParts(window, fakePane);

        expect(parts).toHaveLength(2);
        expect(parts[0]).toBe(footerOf(window, fakePane));
        expect(drawnTexts(parts[1] ?? drawn())).toEqual(fakePane.lines);
      }
    },
  );

  test.each(scenes)(
    'header-mode-$name draws the texts, icons, and fills of footer-$name in every chrome row',
    (expected) => {
      const header = headerScene(expected.name);
      const footer = footerScene(expected.name);

      for (const fakePane of panesOf(expected)) {
        const top = footerOf(header, fakePane) ?? drawn('missing header');
        const bottom = footerOf(footer, fakePane) ?? drawn('missing footer');

        expect(drawnTexts(top)).toEqual(drawnTexts(bottom));
        expect(drawnTexts(top)).toContain(fakePane.name);
        expect(drawnIcons(top)).toEqual(drawnIcons(bottom));

        expect(descendants(top).map((part) => part.backgroundColors)).toEqual(
          descendants(bottom).map((part) => part.backgroundColors),
        );
      }
    },
  );

  test.each(scenes)(
    'header-mode-$name differs from footer-$name in the order of its parts only',
    (expected) => {
      expect(sorted(headerScene(expected.name))).toEqual(sorted(footerScene(expected.name)));
      expect(modeLabels(drawnTexts(headerScene(expected.name)))).toEqual([expected.mode]);
    },
  );

  test.each(['insert', 'normal', 'pending'] as const)(
    'header-mode-%s draws the Changes title row above its list',
    (name) => {
      const texts = drawnTexts(headerScene(name));

      expect(texts.indexOf('Changes')).toBeGreaterThan(-1);
      expect(texts.indexOf('Changes')).toBeLessThan(texts.indexOf('src/kit/paneHeader.ts'));
    },
  );

  test.each(scenes)('header-mode-$name divides each chrome row on its bottom edge', (expected) => {
    const window = headerScene(expected.name);

    for (const fakePane of panesOf(expected)) {
      const chrome = footerOf(window, fakePane);

      expect(hasStyle(chrome, 'border_b')).toBe(true);
      expect(hasStyle(chrome, 'border_t')).toBe(false);
    }
  });

  test.each(scenes)('footer-$name divides each footer on its top edge', (expected) => {
    const window = footerScene(expected.name);

    for (const fakePane of panesOf(expected)) {
      const chrome = footerOf(window, fakePane);

      expect(hasStyle(chrome, 'border_t')).toBe(true);
      expect(hasStyle(chrome, 'border_b')).toBe(false);
    }
  });

  test.each(['top', 'bottom'] as const)(
    'a narrowed row at the %s cuts its branch in the middle and lets it shrink',
    (position) => {
      const window = modeScene('insert', position);

      const branch = elementWithText(
        footerOf(window, agentPane) ?? drawn(),
        agentPane.branch ?? '',
      );

      expect(hasStyle(branch ?? undefined, 'text_ellipsis_middle')).toBe(true);
      expect(hasStyle(branch ?? undefined, 'flex_none')).toBe(false);
    },
  );

  test.each(['top', 'bottom'] as const)(
    'a full row at the %s keeps its branch whole at a fixed width',
    (position) => {
      const window = modeScene('lone', position);

      const branch = elementWithText(
        footerOf(window, agentPane) ?? drawn(),
        agentPane.branch ?? '',
      );

      expect(hasStyle(branch ?? undefined, 'flex_none')).toBe(true);
      expect(hasStyle(branch ?? undefined, 'text_ellipsis_middle')).toBe(false);
    },
  );

  test('a narrow row drops the task and keeps the branch and the folder', () => {
    expect(footerTexts(footerScene('insert'), agentPane)).toEqual([
      'Insert',
      agentPane.name,
      agentPane.branch ?? '',
      agentPane.folder,
    ]);
  });

  test('the narrowest row drops the folder after the task and keeps the branch', () => {
    expect(footerTexts(footerScene('pending'), agentPane)).toEqual([
      'Normal',
      '3s',
      agentPane.name,
      agentPane.branch ?? '',
    ]);
  });

  test.each(scenes)('footer-$name draws its one mode label outside the tab bar', (expected) => {
    const window = footerScene(expected.name);

    expect(modeLabels(drawnTexts(window))).toEqual([expected.mode]);
  });

  test('the direction scenes keep their tab bar mode pill', () => {
    expect(modeLabels(drawnTexts(directionWindow(koja)))).toEqual(['Insert']);
    expect(modeLabels(drawnTexts(directionWindow(kojaNormal)))).toEqual(['Normal']);
  });

  test('normal mode tints the focused footer and no other footer', () => {
    const window = footerScene('split-normal');

    expect(footerOf(window, agentPane)?.backgroundColors).toEqual([
      kojaNormal.pane.focusedHeaderFill,
    ]);

    expect(footerOf(window, shellPane)?.backgroundColors).toEqual([]);
    expect(footerOf(window, reviewPane)?.backgroundColors).toEqual([]);
  });

  test('insert mode tints no footer', () => {
    const window = footerScene('split');

    expect(footerOf(window, reviewPane)?.backgroundColors).toEqual([]);
  });

  test.each(['insert', 'normal', 'pending'] as const)(
    'footer-%s draws the Changes title row below its list',
    (name) => {
      const texts = drawnTexts(footerScene(name));

      expect(texts.indexOf('src/kit/button.ts')).toBeGreaterThan(-1);
      expect(texts.indexOf('Changes')).toBeGreaterThan(texts.indexOf('src/kit/button.ts'));
      expect(texts.indexOf('3 files')).toBe(texts.indexOf('Changes') + 1);
    },
  );

  test.each([
    { name: 'direction-koja', tokens: koja },
    { name: 'direction-koja-normal', tokens: kojaNormal },
  ])('$name keeps the Changes title row above its list', ({ tokens }) => {
    const texts = drawnTexts(directionWindow(tokens));

    expect(texts.indexOf('Changes')).toBeGreaterThan(-1);
    expect(texts.indexOf('Changes')).toBeLessThan(texts.indexOf('src/kit/paneHeader.ts'));
  });

  test('every agent pane footer shows its branch', () => {
    for (const expected of scenes) {
      const window = footerScene(expected.name);

      for (const fakePane of [expected.focused, ...expected.unfocused]) {
        expect(fakePane.branch).toBeDefined();
        expect(footerTexts(window, fakePane)).toContain(fakePane.branch ?? '');
      }
    }
  });

  test('the Insert label draws without a border and the pending keys with one', () => {
    const insert = descendants(footerScene('insert')).find((part) => part.texts.includes('Insert'));
    const keys = descendants(footerScene('pending')).find((part) => part.texts.includes('3s'));

    expect(insert?.borderColors).toEqual([]);
    expect(keys?.borderColors).toHaveLength(1);
  });

  test('the Insert and Normal labels draw different fills', () => {
    const fillOf = (name: 'insert' | 'normal', text: string): string[] | undefined =>
      descendants(footerScene(name)).find((part) => part.texts.includes(text))?.backgroundColors;

    expect(fillOf('insert', 'Insert')).toHaveLength(1);
    expect(fillOf('normal', 'Normal')).toHaveLength(1);
    expect(fillOf('insert', 'Insert')).not.toEqual(fillOf('normal', 'Normal'));
  });

  test.each(['split', 'split-normal', 'lone'] as const)(
    'footer-%s draws no Changes panel',
    (name) => {
      expect(drawnTexts(footerScene(name))).not.toContain('Changes');
    },
  );

  test('the lone scene draws one terminal pane', () => {
    const window = footerScene('lone');

    expect(footerOf(window, shellPane)).toBeUndefined();
    expect(footerOf(window, reviewPane)).toBeUndefined();
  });

  test('the split stacks the agent pane above the shell pane, beside the review pane', () => {
    const window = footerScene('split');
    const texts = drawnTexts(window);
    const firstLineOf = (fakePane: FakePane): number => texts.indexOf(fakePane.lines.at(0) ?? '');

    const stack = descendants(window).find(
      (part) =>
        part.kids.length === 2 &&
        footerOf(part.kids[0] ?? drawn(), agentPane) !== undefined &&
        footerOf(part.kids[1] ?? drawn(), shellPane) !== undefined,
    );

    expect(stack).toBeDefined();
    expect(footerOf(stack ?? drawn(), reviewPane)).toBeUndefined();
    expect(firstLineOf(reviewPane)).toBeGreaterThan(firstLineOf(shellPane));
  });
});
