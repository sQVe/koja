import { afterAll, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts, drawnTooltips } from '../../../../../tests/drawn.ts';
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
  pullRequestScene: (name: string) => DrawnElement;
};

const { koja } = (await import(tokensPath)) as {
  koja: { ink: { text: string }; marks: { blocked: string }; rows: { selectedFill: string } };
};

const checkPath = 'src/mods/koja-spaces/rows.ts:48';

const scenes = [
  'tray-bar',
  'tray-header',
  'tray-section',
  'blocked',
  'sent',
  'ready',
  'ready-menu',
  'merge-confirm',
  'merge-failed',
  'checks-failed',
  'unreachable',
  'normal',
  'zoomed',
];

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

const paneOf = (name: string): DrawnElement => {
  const pane = descendants(pullRequestScene(name)).findLast((element) => {
    const texts = drawnTexts(element);

    return texts.includes('Pull request') && texts.some((text) => text.includes('· GitHub'));
  });

  expect(pane).toBeDefined();

  return pane!;
};

afterAll(() => {
  mock.restore();
});

test('all thirteen PR scenes keep the agent beside the view except when zoomed and draw no diff', () => {
  for (const name of scenes) {
    const texts = drawnTexts(pullRequestScene(name));

    expect(texts).toContain('Pull request');
    expect(texts.includes('> bun run check')).toBe(name !== 'zoomed');
    expect(texts.includes('Normal')).toBe(name === 'normal');
    expect(texts).not.toContain('Diff');
    expect(texts.some((text) => text.startsWith('@@'))).toBe(false);
    expect(texts).not.toContain('#41 Design the sidebar');
  }
});

test('prompt variants queue two items instead of sending each item immediately', () => {
  for (const name of ['tray-bar', 'tray-header', 'tray-section']) {
    const pane = paneOf(name);
    const texts = drawnTexts(pane);

    expect(texts.filter((text) => text === 'Added')).toHaveLength(2);
    const action = name === 'tray-bar' ? 'Add for agent' : 'Add to prompt';
    const remaining = name === 'tray-bar' ? 2 : 1;

    expect(texts.filter((text) => text === action)).toHaveLength(remaining);
    expect(texts).toContain("Type 'string' is not assignable to type 'RowLook'.");
    expect(texts).toContain('48  return selectedRow(space, look);');
    expect(texts).toContain('28  label(branch).truncate()');
    expect(drawnIcons(pane)).toContain('check');
  }

  const bar = drawnTexts(paneOf('tray-bar'));
  const header = drawnTexts(paneOf('tray-header'));
  const section = drawnTexts(paneOf('tray-section'));

  expect(bar).toContain('2 added for Design the sidebar');
  expect(bar).toContain('Clear');
  expect(bar.filter((text) => text === 'Send to agent')).toHaveLength(1);
  expect(header).toContain('Prompt for the agent');
  expect(header).toContain('typecheck ×');
  expect(header).toContain('rows.ts:48 ×');
  expect(section).toContain('Send 2 to agent');
  expect(section).not.toContain('Clear');

  const selectedRow = descendants(paneOf('tray-section')).findLast((element) => {
    const texts = drawnTexts(element);

    return texts.includes('typecheck') && texts.includes('Added');
  });

  expect(drawnIcons(selectedRow!).slice(0, 2)).toEqual(['check', 'circle-x']);
});

test('empty and sent prompts have no tray and sent rows retain their content', () => {
  const blocked = drawnTexts(paneOf('blocked'));
  const sent = drawnTexts(paneOf('sent'));

  expect(blocked.filter((text) => text === 'Add for agent')).toHaveLength(4);
  expect(sent.filter((text) => text === 'Sent to agent · just now')).toHaveLength(2);
  expect(sent.filter((text) => text === 'Add for agent')).toHaveLength(2);
  expect(sent).toContain('Keep the selected row visible when the group folds.');

  for (const texts of [blocked, sent]) {
    expect(texts).not.toContain('Send to agent');
    expect(texts).not.toContain('2 added for Design the sidebar');
  }
});

test('ready PRs use the split action and its menu offers all four routes', () => {
  const ready = drawnTexts(paneOf('ready'));
  const menu = drawnTexts(paneOf('ready-menu'));

  expect(ready).toContain('Ready to merge');
  expect(ready).toContain('Squash and merge');
  expect(ready).not.toContain('Needs you');
  expect(ready).not.toContain('Ask agent to merge');

  for (const choice of [
    'Squash and merge',
    'Ask agent to merge',
    'Merge commit',
    'Rebase and merge',
  ]) {
    expect(menu).toContain(choice);
  }
});

test('merge confirmation names the method and branch deletion without a destructive action', () => {
  const scene = pullRequestScene('merge-confirm');
  const texts = drawnTexts(scene);

  expect(texts).toContain('Squash and merge #41?');
  expect(texts).toContain('Squashes 5 commits into main.');
  expect(texts).toContain('Deletes the branch me-1090-design-the-sidebar.');
  expect(texts).toContain('Cancel');

  const button = descendants(scene).findLast(
    (element) =>
      drawnTexts(element).includes('Merge') && element.backgroundColors.includes(koja.ink.text),
  );

  expect(button).toBeDefined();
  expect(drawnTexts(button!)).toContain('↵');
  expect(button!.backgroundColors).not.toContain(koja.marks.blocked);
});

test('failed sync and merge keep their last data and offer a local Retry', () => {
  const checks = drawnTexts(paneOf('checks-failed'));
  const merge = drawnTexts(paneOf('merge-failed'));

  expect(checks).toContain('Could not sync checks · showing checks from 6m ago');
  expect(checks).toContain('typecheck');
  expect(checks).toContain('failed 9m ago ·');
  expect(checks).not.toContain('failed 3m ago');
  expect(checks).toContain('Retry');
  expect(merge).toContain('Could not merge');
  expect(merge).toContain('main changed since the last sync');
  expect(merge).toContain('Sync and retry');
  expect(merge).not.toContain('Ready to merge');
  expect(merge).not.toContain('Squash and merge');
  expect(merge).not.toContain('Into main · deletes the branch');
  expect(merge).toContain('open');
});

test('an unreachable PR shows only its identity and fetch error', () => {
  const texts = drawnTexts(paneOf('unreachable'));

  expect(texts).toContain('koja #41 · GitHub');
  expect(texts).toContain('Could not read PR · GitHub is unreachable');
  expect(texts).toContain('Retry');
  expect(texts).not.toContain('synced 1m ago');
  expect(texts).not.toContain('open');
  expect(texts).not.toContain('Needs you');
});

test('file lists name Greppa once and branch facts retain their full tooltip', () => {
  for (const name of ['blocked', 'ready', 'zoomed']) {
    const pane = paneOf(name);
    const texts = drawnTexts(pane);

    const branch = 'me-1090-design-the-sidebar → main';

    expect(texts.filter((text) => text === 'opens in Greppa')).toHaveLength(1);
    expect(drawnTooltips(pane)).toContain(branch);
    expect(texts).not.toContain('Files 9');
  }

  const zoomed = drawnTexts(paneOf('zoomed'));

  expect(zoomed).toContain('2 added for Design the sidebar');
  expect(zoomed).toContain('src/mods/koja-spaces/rows.ts');
  expect(zoomed).toContain('−2');
});

test('picked views offer Sync and keep only Branch Ticket and Agent facts', () => {
  const pickedScenes = scenes.filter(
    (scene) => !['tray-header', 'tray-section', 'unreachable'].includes(scene),
  );

  for (const name of pickedScenes) {
    const texts = drawnTexts(paneOf(name));

    expect(texts.filter((text) => text === 'Sync')).toHaveLength(1);
    expect(texts.indexOf('Sync')).toBe(texts.indexOf('synced 1m ago') + 1);

    for (const fact of ['Branch', 'Ticket', 'Agent']) {
      expect(texts).toContain(fact);
    }

    for (const fact of ['Checks', 'Threads', 'Review', 'Merge']) {
      expect(texts).not.toContain(fact);
    }
  }
});

test('blocked views explain merge blockers and expose the requested review for the agent', () => {
  for (const name of ['blocked', 'tray-bar', 'sent', 'checks-failed', 'normal', 'zoomed']) {
    const pane = paneOf(name);
    const texts = drawnTexts(pane);

    expect(texts).toContain("Can't merge yet");
    expect(texts).toContain('1 failing check · 2 unresolved threads · changes requested');
    expect(texts).toContain('Merge appears here when nothing blocks it.');
    expect(texts.indexOf("Can't merge yet")).toBeLessThan(texts.indexOf('Needs you'));
    expect(texts[texts.indexOf('Needs you') + 1]).toBe('4');
    expect(texts).toContain('Changes requested');
    expect(texts).toContain('Please fix the two threads before merging.');
    expect(texts).not.toContain('Squash and merge');
    expect(descendants(pane).some((element) => element.isDisabled)).toBe(false);
  }
});

test('ready and failed merge views retain the selected spaces PR identity and nine files', () => {
  for (const name of ['ready', 'ready-menu', 'merge-failed', 'merge-confirm']) {
    const texts = drawnTexts(paneOf(name));

    expect(texts).toContain('koja #41 · GitHub');
    expect(texts).toContain('Design the sidebar');
    expect(texts).toContain('ME-1090 · Linear');
    expect(texts).toContain('src/mods/koja-spaces/rows.ts');
    expect(texts).not.toContain('koja #44 · GitHub');
    expect(texts[texts.indexOf('Files') + 1]).toBe('9');
  }

  const ready = drawnTexts(paneOf('ready'));

  expect(ready).toContain('4 checks passed · 0 unresolved · 3 resolved threads');
  expect(ready).toContain('approved by jonas-l · no conflicts');
});

test('attention items put metadata before excerpts and show the complete thread range', () => {
  const pane = paneOf('blocked');
  const texts = drawnTexts(pane);

  expect(texts).toContain('failed 3m ago ·');
  expect(texts).toContain('log on GitHub');
  expect(texts.indexOf('failed 3m ago ·')).toBeLessThan(texts.indexOf(checkPath));
  expect(texts).toContain('src/kit/');

  for (const number of ['27', '28', '29', '30', '31']) {
    expect(texts.some((text) => text.startsWith(`${number}  `))).toBe(true);
  }

  const summary = descendants(pane).findLast(
    (element) =>
      drawnTexts(element).includes('3 checks passed · 1 thread resolved') &&
      drawnIcons(element).includes('chevron-right'),
  );

  expect(summary).toBeDefined();
});

test('added items use selected fill while the remaining items stay unselected', () => {
  const pane = paneOf('tray-bar');

  const selected = descendants(pane).filter((element) =>
    element.backgroundColors.includes(koja.rows.selectedFill),
  );

  expect(selected).toHaveLength(2);

  for (const element of selected) {
    expect(drawnTexts(element)).toContain('Added');
    expect(drawnIcons(element)).toContain('check');
    expect(drawnTexts(element)).not.toContain('Add for agent');
  }
});

test('alternate trays keep their original facts actions and short snippet', () => {
  for (const name of ['tray-header', 'tray-section']) {
    const texts = drawnTexts(paneOf(name));

    expect(texts).toContain('Checks');
    expect(texts).toContain('Threads');
    expect(texts).toContain('Review');
    expect(texts).toContain('Add to prompt');
    expect(texts).not.toContain('Sync');
    expect(texts).not.toContain("Can't merge yet");
    expect(texts).not.toContain('Changes requested');
    expect(texts.some((text) => text.startsWith('31  '))).toBe(false);
  }
});
