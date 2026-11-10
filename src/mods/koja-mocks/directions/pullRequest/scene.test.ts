import { afterAll, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts } from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));
await mock.module('herdr', () => herdrFake());

await mock.module('../../../../kit/index.ts', () =>
  kitIndexFake({ icon: (name: string) => drawn(name) }),
);

const scenePath = './scene.ts';
const tokensPath = '../koja.ts';

const { pullRequestScene } = (await import(scenePath)) as {
  pullRequestScene: (take: string, state: string) => DrawnElement;
};

const { koja } = (await import(tokensPath)) as {
  koja: { ink: { text: string }; marks: { working: string; modified: string } };
};

const takes = ['merge', 'agent', 'split'];

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

const primaryAction = (scene: DrawnElement): string[] => {
  const button = descendants(scene).find((element) =>
    element.backgroundColors.includes(koja.ink.text),
  );

  return button === undefined ? [] : drawnTexts(button);
};

afterAll(() => {
  mock.restore();
});

test('PR takes draw all nine insert-mode views with separate Diff panes', () => {
  for (const take of takes) {
    for (const state of ['blocked', 'ready', 'diff']) {
      const texts = drawnTexts(pullRequestScene(take, state));
      const identifier = state === 'ready' ? 'koja #44 · GitHub' : 'koja #41 · GitHub';
      const pane = state === 'diff' ? 'Diff' : 'Pull request';

      expect(texts).toContain(identifier);
      expect(texts).toContain(pane);
      expect(texts).toContain('Insert');
      expect(texts).not.toContain('Normal');
      expect(texts.includes('> bun run check')).toBe(state === 'blocked');
      expect(texts).not.toContain('Overview');
      expect(texts).not.toContain('Files 9');
    }
  }
});

test('every blocked take offers three agent handoffs with logs and thread snippets', () => {
  for (const take of takes) {
    const texts = drawnTexts(pullRequestScene(take, 'blocked'));

    expect(texts).toContain('Needs you');
    expect(texts).toContain("Type 'string' is not assignable to type 'RowLook'.");
    expect(texts).toContain('Keep the selected row visible when the group folds.');
    expect(texts).toContain('Can the branch truncate before the repository name?');
    expect(texts).toContain('48  return selectedRow(space, look);');
    expect(texts).toContain('28  label(branch).truncate()');
    expect(texts.filter((text) => text === 'Send to agent')).toHaveLength(3);
    expect(texts).not.toContain('Squash and merge');
    expect(texts).not.toContain('Ask agent to merge');
  }
});

test('ready merge and agent takes offer both routes with opposite primary actions', () => {
  for (const take of ['merge', 'agent']) {
    const scene = pullRequestScene(take, 'ready');
    const texts = drawnTexts(scene);
    const primary = take === 'merge' ? 'Squash and merge' : 'Ask agent to merge';

    expect(texts).toContain('Ready to merge');
    expect(texts).toContain('Squash and merge');
    expect(texts).toContain('Ask agent to merge');
    expect(texts).not.toContain('Needs you');
    expect(primaryAction(scene)).toEqual([primary]);
    expect(texts).toContain('src/mods/koja-stack/main.ts');
  }
});

test('the ready split take shows its four merge choices and marks the current choice', () => {
  const scene = pullRequestScene('split', 'ready');
  const texts = drawnTexts(scene);

  expect(primaryAction(scene)).toEqual(['Squash and merge']);
  expect(texts.filter((text) => text === 'Squash and merge')).toHaveLength(2);
  expect(texts).toContain('Ask agent to merge');
  expect(texts).toContain('Merge commit');
  expect(texts).toContain('Rebase and merge');

  const choice = descendants(scene).findLast((element) => {
    const choiceTexts = drawnTexts(element);

    return choiceTexts.includes('Squash and merge') && drawnIcons(element).includes('check');
  });

  expect(choice).toBeDefined();
  expect(drawnTexts(choice!)).toEqual(['Squash and merge']);
  expect(drawnIcons(scene)).toContain('chevron-down');
});

test('all PR takes link the existing space agent terminal', () => {
  for (const take of takes) {
    for (const state of ['blocked', 'ready']) {
      const scene = pullRequestScene(take, state);

      const fact = descendants(scene).findLast(
        (element) =>
          drawnTexts(element).includes('Agent') && drawnIcons(element).includes('terminal'),
      );

      expect(fact).toBeDefined();
      expect(drawnTexts(fact!)).toEqual(['Agent', 'Design the sidebar']);
    }
  }
});

test('every Diff pane gives its anchored thread an agent action and keeps amber marks', () => {
  for (const take of takes) {
    const scene = pullRequestScene(take, 'diff');
    const texts = drawnTexts(scene);
    const anchor = texts.indexOf('  return selectedRow(space, look);');
    const comment = texts.indexOf('Keep the selected row visible when the group folds.');
    const action = texts.indexOf('Send to agent');

    expect(anchor).toBeGreaterThan(-1);
    expect(comment).toBeGreaterThan(anchor);
    expect(action).toBeGreaterThan(comment);
    expect(action).toBeLessThan(texts.indexOf('  return visibleRows;'));
    expect(texts).toContain('48');
    expect(texts).toContain('72');
    expect(texts).toContain('−2');

    const pane = descendants(scene).findLast((element) => {
      const paneTexts = drawnTexts(element);

      return paneTexts.includes('Diff') && paneTexts.includes('rows.ts:48 · unresolved');
    });

    const marks = descendants(pane!).filter((element) => element.path === 'message-square');

    const amber = new Set([koja.marks.working, koja.marks.modified]);

    expect(marks.length).toBeGreaterThan(0);

    expect(marks.every((mark) => mark.textColors.some((color) => amber.has(color)))).toBe(true);
  }
});

test('the agent Diff pane replaces rail facts with one blocker line and a leading file list', () => {
  const texts = drawnTexts(pullRequestScene('agent', 'diff'));

  expect(texts).toContain('1 check failing · 2 threads unresolved · changes requested');
  expect(texts).not.toContain('Branch');
  expect(texts).not.toContain('Review');

  expect(texts.indexOf('rows.ts')).toBeLessThan(
    texts.indexOf('  return selectedRow(space, look);'),
  );
});
