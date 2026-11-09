import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts } from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';

type PanelName = 'Stack' | 'Changes' | 'Workers' | 'Files';

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake());

await mock.module('../../../../kit/index.ts', () =>
  kitIndexFake({ icon: (name: string) => drawn(name) }),
);

// Loaded by path, so the root typecheck does not follow them into source that needs Herdr's types.
const arrangementsPath = './arrangements.ts';
const kojaPath = '../koja.ts';

const { docksScene, sectionsScene, spineScene, tabsScene } = (await import(arrangementsPath)) as {
  docksScene: (tokens: unknown) => DrawnElement;
  sectionsScene: (tokens: unknown) => DrawnElement;
  spineScene: (showFiles: boolean, tokens: unknown) => DrawnElement;
  tabsScene: (active: PanelName, tokens: unknown) => DrawnElement;
};

const spinePath = './spine.ts';

const { spineTakeScene } = (await import(spinePath)) as {
  spineTakeScene: (take: string, tokens: unknown) => DrawnElement;
};

const { koja } = (await import(kojaPath)) as { koja: unknown };

afterAll(() => {
  mock.restore();
});

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

const tabWith = (window: DrawnElement, name: string): DrawnElement | undefined =>
  descendants(window).find((part) => part.kids.some((kid) => kid.texts.includes(name)));

const panelScenes = [
  { name: 'panels-tabs-stack', draw: () => tabsScene('Stack', koja) },
  { name: 'panels-tabs-changes', draw: () => tabsScene('Changes', koja) },
  { name: 'panels-tabs-workers', draw: () => tabsScene('Workers', koja) },
  { name: 'panels-tabs-files', draw: () => tabsScene('Files', koja) },
  { name: 'panels-sections', draw: () => sectionsScene(koja) },
  { name: 'panels-spine', draw: () => spineScene(false, koja) },
  { name: 'panels-spine-files', draw: () => spineScene(true, koja) },
  { name: 'panels-docks', draw: () => docksScene(koja) },
];

describe('the side panel scenes', () => {
  test.each(panelScenes)('$name draws the agent pane without the zsh pane', (scene) => {
    const texts = drawnTexts(scene.draw());

    expect(texts).toContain('> bun run check');
    expect(texts).not.toContain('$ git log --oneline -3');
  });

  test('a tabs scene draws only the active panel', () => {
    const texts = drawnTexts(tabsScene('Stack', koja));

    expect(texts).toContain('Find a space by PR');
    expect(texts).not.toContain('Port the shell scene');
  });

  test('a hidden Workers tab shows the question mark of a blocked worker', () => {
    const tab = tabWith(tabsScene('Stack', koja), 'Workers');

    expect(drawnIcons(tab ?? drawn())).toContain('message-circle-question');
  });

  test('a hidden Stack tab shows the failing mark of a PR', () => {
    const tab = tabWith(tabsScene('Workers', koja), 'Stack');

    expect(drawnIcons(tab ?? drawn())).toContain('circle-x');
  });

  test('the active tab shows no mark', () => {
    const tab = tabWith(tabsScene('Workers', koja), 'Workers');

    expect(tab).toBeDefined();
    expect(drawnIcons(tab ?? drawn())).toEqual([]);
  });

  test('the Workers panel asks for a reply to the blocked worker', () => {
    expect(drawnTexts(tabsScene('Workers', koja))).toContain('Reply to the worker');
  });

  test('the spine shows the question without a reply field', () => {
    const texts = drawnTexts(spineScene(false, koja));

    expect(texts).toContain('Keep the 6 px ring for a space with no agent, or use 8 px?');
    expect(texts).not.toContain('Reply to the worker');
  });

  test('the spine swapped to Files draws the tree instead of the stack', () => {
    const texts = drawnTexts(spineScene(true, koja));

    expect(texts).toContain('package.json');
    expect(texts).not.toContain('Find a space by PR');
  });
});

const takes = ['inline', 'rail', 'pinned'];

const count = (texts: string[], text: string): number =>
  texts.filter((candidate) => candidate === text).length;

describe('the spine takes', () => {
  test.each(takes)('%s shows the checked-out PR facts once', (take) => {
    expect(count(drawnTexts(spineTakeScene(take, koja)), '2 checks running')).toBe(1);
  });

  test.each(takes)('%s groups the PR work under Changes and Workers', (take) => {
    const texts = drawnTexts(spineTakeScene(take, koja));

    expect(texts).toContain('Changes');
    expect(texts).toContain('Workers');
  });

  test.each(takes)('%s offers a reply and a commit', (take) => {
    const texts = drawnTexts(spineTakeScene(take, koja));

    expect(texts).toContain('Reply to the worker');
    expect(texts).toContain('Commit');
  });

  test('the rail ends at the trunk', () => {
    expect(drawnTexts(spineTakeScene('rail', koja))).toContain('main');
  });

  test('the pinned take also lists the current PR in the stack map', () => {
    const title = 'Design the sidebar';
    const inline = count(drawnTexts(spineTakeScene('inline', koja)), title);

    expect(count(drawnTexts(spineTakeScene('pinned', koja)), title)).toBe(inline + 1);
  });
});
