import { afterAll, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts, drawnTooltips } from '../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../tests/moduleFakes.ts';
import { controlSize, radius, shellSize, spacing } from '../../../kit/size.ts';

const textElement = (value: string): DrawnElement => {
  const element = drawn();

  element.texts.push(value);

  return element;
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    h_flex: () => drawn(),
    v_flex: () => drawn(),
    Scrollbar: { vertical: (identifier: string) => drawn(`scrollbar/${identifier}`) },
  }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));
await mock.module('herdr', () => herdrFake());

await mock.module('../../../kit/index.ts', () =>
  kitIndexFake({
    colors: () => ({
      foreground: 'foreground',
      dim: 'dim',
      background: 'background',
      accent: 'accent',
      selected: 'selected',
      chrome: 'chrome',
    }),
    controlSize,
    radius,
    shellSize,
    spacing,
    icon: (name: string) => drawn(name),
    iconButton: (options: { name: string }) => drawn(options.name),
    iconToggle: (options: { name: string }) => drawn(options.name),
    modePill: (options: { label: string }) => textElement(options.label),
    paneHeader: (options: { name: string }) => textElement(options.name),
    programIcon: () => drawn('terminal'),
    roleText: (_role: string, value: string) => textElement(value),
    tab: (options: { label: string }) => textElement(options.label),
  }),
);

const shellPath = './shell.ts';
const pullRequestPath = '../directions/pullRequest/scene.ts';

const { shellPullRequestScene } = (await import(shellPath)) as {
  shellPullRequestScene: () => DrawnElement;
};

const { pullRequestScene } = (await import(pullRequestPath)) as {
  pullRequestScene: (name: 'blocked') => DrawnElement;
};

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

const pullPane = (scene: DrawnElement): DrawnElement | undefined =>
  descendants(scene).findLast((element) => {
    const texts = drawnTexts(element);

    return texts.includes('Pull request') && texts.includes('koja #41 · GitHub');
  });

afterAll(() => {
  mock.restore();
});

test('the shell PR scene shows the blocked direction pane beside its agent', () => {
  const scene = shellPullRequestScene();
  const pane = pullPane(scene);
  const expected = pullPane(pullRequestScene('blocked'));

  expect(pane).toBeDefined();
  expect(expected).toBeDefined();
  expect(drawnTexts(pane!)).toEqual(drawnTexts(expected!));
  expect(drawnIcons(pane!)).toEqual(drawnIcons(expected!));
  expect(drawnTooltips(pane!)).toEqual(drawnTooltips(expected!));
  const texts = drawnTexts(scene);

  expect(texts).toContain('Claude Code');
  expect(texts).toContain('> bun run check');
  expect(texts).toContain('Insert');
  expect(texts).not.toContain('Space');

  const split = descendants(scene).find((element) => {
    const agent = element.kids.findIndex((child) => drawnTexts(child).includes('> bun run check'));
    const request = element.kids.findIndex((child) => drawnTexts(child).includes('Pull request'));

    return element.kids.length === 2 && agent === 0 && request === 1;
  });

  expect(split).toBeDefined();
  expect(drawnTexts(split!.kids[0]!)).toContain('> bun run check');
  expect(drawnTexts(split!.kids[0]!)).not.toContain('Pull request');
  expect(drawnTexts(split!.kids[1]!)).toContain('Pull request');
  expect(drawnTexts(split!.kids[1]!)).not.toContain('> bun run check');
});
