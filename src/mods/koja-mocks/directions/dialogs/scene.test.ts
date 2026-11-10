import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../../../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, kitIndexFake } from '../../../../../tests/moduleFakes.ts';

interface TokenLook {
  rows: { selectedFill: string };
}

const backgrounds = new WeakMap<DrawnElement, unknown>();
const truncated = new WeakSet<DrawnElement>();
const fixedSize = new WeakSet<DrawnElement>();

const painted = (): DrawnElement => {
  const element = drawn();

  const result: DrawnElement = new Proxy(element, {
    get: (target, key) => {
      const properties = target as unknown as Record<PropertyKey, unknown>;
      const value = properties[key];

      if (typeof value !== 'function') {
        return value;
      }

      const method = value as (...args: unknown[]) => unknown;

      return (...args: unknown[]) => {
        if (key === 'bg') {
          backgrounds.set(result, args[0]);
        }

        if (key === 'truncate') {
          truncated.add(result);
        }

        if (key === 'flex_none') {
          fixedSize.add(result);
        }

        method(...args);

        return result;
      };
    },
  });

  return result;
};

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: painted, v_flex: painted }));
await mock.module('gpui-kit', () => gpuiKitFake({ div: painted }));
await mock.module('../../../../kit/index.ts', () => kitIndexFake({ icon: painted }));

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

const tokenPath = '../koja.ts';

const { koja, kojaNormal } = (await import(tokenPath)) as Record<'koja' | 'kojaNormal', TokenLook>;

const actionsPath = './actions.ts';

const { dialogActions } = (await import(actionsPath)) as {
  dialogActions: (ask: string, tokens: TokenLook) => DrawnElement;
};

const bodiesPath = './bodies.ts';

const { askBody } = (await import(bodiesPath)) as {
  askBody: (ask: string, tokens: TokenLook) => DrawnElement[];
};

const contentPath = './content.ts';

const { lostChanges, removalClosingLines, newBranch } = (await import(contentPath)) as {
  newBranch: string;
  lostChanges: { path: string }[];
  removalClosingLines: string[];
};

const shellContentPath = '../../scenes/shellContent.ts';

const { agentPane } = (await import(shellContentPath)) as { agentPane: { folder: string } };

const partsPath = './parts.ts';

const { quotedTitle } = (await import(partsPath)) as {
  quotedTitle: (title: string, name: string, tokens: TokenLook) => DrawnElement;
};

const scenePath = './scene.ts';

const { dialogScene } = (await import(scenePath)) as {
  dialogScene: (ask: string, tokens: TokenLook) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

describe('dialog drawing', () => {
  test('the new worktree dialog draws its folder in the repository shown by the panes', () => {
    const texts = askBody('wt-new', koja).flatMap((part) => drawnTexts(part));

    expect(texts).toContain(`${agentPane.folder}/${newBranch}`);
  });

  test('remove shows lost files before closing consequences and branch deletion', () => {
    for (const tokens of [koja, kojaNormal]) {
      const body = askBody('wt-remove', tokens);
      const [files, closing, branch] = body;
      const fileTexts = drawnTexts(files as DrawnElement);

      expect(body).toHaveLength(3);

      for (const change of lostChanges) {
        expect(fileTexts).toContain(change.path);
      }

      expect(drawnTexts(closing as DrawnElement)).toEqual(removalClosingLines);
      expect(drawnTexts(branch as DrawnElement).length).toBeGreaterThan(0);
    }
  });

  test('long quoted titles truncate only the name and keep the closing quote', () => {
    const name = 'A space name long enough to exceed the entire dialog width'.repeat(3);

    for (const tokens of [koja, kojaNormal]) {
      const title = quotedTitle('Rename space', name, tokens);
      const [prefix, namePart, closingQuote] = title.kids;

      expect(title.kids).toHaveLength(3);
      expect(namePart?.texts).toEqual([name]);
      expect(truncated.has(namePart as DrawnElement)).toBe(true);
      expect(fixedSize.has(namePart as DrawnElement)).toBe(false);
      expect(fixedSize.has(prefix as DrawnElement)).toBe(true);
      expect(closingQuote?.texts).toEqual(['”']);
      expect(fixedSize.has(closingQuote as DrawnElement)).toBe(true);
    }
  });

  test('close consequences render as two separate lines in both modes', () => {
    for (const tokens of [koja, kojaNormal]) {
      const scene = dialogScene('close', tokens);
      const overlay = scene.kids.at(-1) as DrawnElement;
      const card = overlay.kids[0] as DrawnElement;
      const body = card.kids[1] as DrawnElement;
      const consequences = body.kids[0] as DrawnElement;

      expect(consequences.kids).toHaveLength(2);
      expect(consequences.kids.every((line) => line.texts.length === 1)).toBe(true);
    }
  });

  test('only the main action has a keycap in every ask and mode', () => {
    for (const tokens of [koja, kojaNormal]) {
      for (const ask of ['close', 'rename', 'wt-new', 'wt-open', 'wt-remove']) {
        const actions = dialogActions(ask, tokens);
        const [cancel, main] = actions.kids;

        expect(drawnTexts(cancel as DrawnElement)).not.toContain('esc');
        expect(drawnTexts(main as DrawnElement)).toContain('↵');
      }
    }
  });

  test('the worktree picker selects a branch not shown in any space', () => {
    for (const tokens of [koja, kojaNormal]) {
      const parts = askBody('wt-open', tokens).flatMap(descendants);

      const labeledParts = parts.filter((part) => {
        const labels = drawnTexts(part);

        return labels.length > 0;
      });

      const selected = labeledParts.filter(
        (part) => backgrounds.get(part) === tokens.rows.selectedFill,
      );

      const selectedTexts = selected.flatMap(drawnTexts);

      expect(selected).toHaveLength(1);
      expect(selectedTexts).toContain('me-1091-side-panels');
      expect(selectedTexts).not.toContain('main');
      expect(selectedTexts).not.toContain('me-1090-design-the-sidebar');
    }
  });
});
