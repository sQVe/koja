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

const { pullRequestScene } = (await import(scenePath)) as {
  pullRequestScene: (variant: string, state: string) => DrawnElement;
};

const variants = ['reader', 'box', 'handoff'];

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

afterAll(() => {
  mock.restore();
});

test('PR scenes draw all nine insert-mode views with the requested PR and pane', () => {
  for (const variant of variants) {
    for (const state of ['blocked', 'ready', 'diff']) {
      const scene = pullRequestScene(variant, state);
      const texts = drawnTexts(scene);
      const identifier = state === 'ready' ? 'koja #44 · GitHub' : 'koja #41 · GitHub';
      const pane = variant === 'box' && state === 'diff' ? 'Diff' : 'Pull request';

      expect(texts).toContain(identifier);
      expect(texts).toContain(pane);
      expect(texts).toContain('Insert');
      expect(texts).not.toContain('Normal');
      expect(texts.includes('> bun run check')).toBe(state === 'blocked');
    }
  }
});

test('blocked PRs show the failure and both unresolved comments without a merge action', () => {
  for (const variant of variants) {
    const texts = drawnTexts(pullRequestScene(variant, 'blocked'));

    expect(texts).toContain("Type 'string' is not assignable to type 'RowLook'.");
    expect(texts).toContain('Keep the selected row visible when the group folds.');
    expect(texts).toContain('Can the branch truncate before the repository name?');
    expect(texts).not.toContain('Squash and merge');
    expect(texts).not.toContain('Ask agent to merge');
  }
});

test('ready PRs distinguish reading, direct merge, and agent handoff', () => {
  const reader = drawnTexts(pullRequestScene('reader', 'ready'));
  const box = drawnTexts(pullRequestScene('box', 'ready'));
  const handoff = drawnTexts(pullRequestScene('handoff', 'ready'));

  for (const texts of [reader, box, handoff]) {
    expect(texts).toContain('Ready to merge');
    expect(texts).not.toContain('Needs you');
  }

  expect(reader).not.toContain('Squash and merge');
  expect(reader).not.toContain('Ask agent to merge');
  expect(box).toContain('Squash and merge');
  expect(box).not.toContain('Ask agent to merge');
  expect(handoff).toContain('Ask agent to merge');
  expect(handoff).not.toContain('Squash and merge');
  expect(handoff).toContain('Overview');
  expect(handoff).not.toContain('Overview 0');
  expect(handoff).toContain('Files 5');

  expect(
    drawnTexts(pullRequestScene('handoff', 'blocked')).filter((text) => text === 'Send to agent'),
  ).toHaveLength(3);
});

test('handoff facts link the existing space agent terminal in every view', () => {
  for (const state of ['blocked', 'ready', 'diff']) {
    const scene = pullRequestScene('handoff', state);

    const fact = descendants(scene).findLast(
      (element) =>
        drawnTexts(element).includes('Agent') && drawnIcons(element).includes('terminal'),
    );

    expect(fact).toBeDefined();
    expect(drawnTexts(fact!)).toEqual(['Agent', 'Design the sidebar']);
  }
});

test('diff views put the thread directly after its commented line and show two numbered hunks', () => {
  for (const variant of variants) {
    const scene = pullRequestScene(variant, 'diff');
    const texts = drawnTexts(scene);
    const anchor = texts.indexOf('  return selectedRow(space, look);');
    const comment = texts.indexOf('Keep the selected row visible when the group folds.');

    expect(anchor).toBeGreaterThan(-1);
    expect(comment).toBeGreaterThan(anchor);
    expect(comment).toBeLessThan(texts.indexOf('  return visibleRows;'));
    expect(texts).toContain('48');
    expect(texts).toContain('72');
    expect(drawnIcons(scene)).toContain('message-square');

    const rows = descendants(scene).filter((element) =>
      element.texts.includes('  return selectedRow(space, look);'),
    );

    expect(rows).toHaveLength(1);
  }
});
