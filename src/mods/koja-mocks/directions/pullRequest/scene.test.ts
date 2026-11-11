import { afterAll, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import {
  drawn,
  drawnIcons,
  drawnTexts,
  drawnTooltips,
  elementWithIcon,
} from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';

interface ViewTokens {
  ink: { text: string; dim: string };
  marks: { blocked: string; working: string; done: string };
  rows: { selectedFill: string };
  text: { body: { size: number }; detail: { size: number } };
}

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    h_flex: () => drawn(),
    v_flex: () => drawn(),
    Scrollbar: { vertical: (identifier: string) => drawn(`scrollbar/${identifier}`) },
  }),
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

const { koja, kojaNormal } = (await import(tokensPath)) as {
  koja: ViewTokens;
  kojaNormal: ViewTokens;
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
    expect(texts.filter((text) => text === action)).toHaveLength(1);
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

  expect(blocked.filter((text) => text === 'Add for agent')).toHaveLength(3);
  expect(blocked).toContain('Add all for agent');
  expect(sent.filter((text) => text === 'Sent to agent · just now')).toHaveLength(2);
  expect(sent.filter((text) => text === 'Add for agent')).toHaveLength(1);
  expect(sent).toContain('Add all for agent');
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

test('failed sync and merge retain their last data and recovery actions', () => {
  const checks = drawnTexts(paneOf('checks-failed'));
  const merge = drawnTexts(paneOf('merge-failed'));

  expect(checks).toContain('Could not sync checks · GitHub timed out');
  expect(checks).toContain('typecheck');
  expect(checks).toContain('failed 9m ago ·');
  expect(checks).not.toContain('failed 3m ago');
  expect(checks).toContain('Sync');
  expect(checks).not.toContain('Retry checks');
  expect(merge).toContain('Could not merge');
  expect(merge).toContain('main changed since the last sync');
  expect(merge).toContain('Update branch and retry');
  expect(merge).not.toContain('Sync and retry');
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

test('picked views offer Sync and keep Branch Ticket Agent and Files facts', () => {
  const pickedScenes = scenes.filter(
    (scene) => !['tray-header', 'tray-section', 'unreachable'].includes(scene),
  );

  for (const name of pickedScenes) {
    const texts = drawnTexts(paneOf(name));

    expect(texts.filter((text) => text === 'Sync')).toHaveLength(1);
    const status = name === 'checks-failed' ? 'synced 1m ago · checks 6m ago' : 'synced 1m ago';

    expect(texts.indexOf('Sync')).toBe(texts.indexOf(status) + 1);

    for (const fact of ['Branch', 'Ticket', 'Agent', 'Files']) {
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
    expect(texts).toContain('1 of 4 checks failing · 2 unresolved threads · changes requested');
    expect(texts).not.toContain('Merge appears here when nothing blocks it.');
    expect(texts.indexOf("Can't merge yet")).toBeLessThan(texts.indexOf('Needs you'));
    expect(texts[texts.indexOf('Needs you') + 1]).toBe('3');
    expect(texts).toContain('Review from jonas-l');
    expect(texts).not.toContain('Please fix the two threads before merging.');

    const review = descendants(pane).findLast((element) => {
      const details = drawnTexts(element);

      return details.includes('Review from jonas-l') && details.includes('rows.ts:48');
    });

    expect(review).toBeDefined();
    expect(drawnTexts(review!)).toContain('rows.ts:48');
    expect(drawnTexts(review!)).toContain('repoLabel.ts:27–31');
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
    expect(texts[texts.lastIndexOf('Files') + 1]).toBe('opens in Greppa');
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
      drawnTexts(element).includes('3 checks · 1 thread resolved') &&
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

test('loaded picked views expose the whole PR diff separately from single files', () => {
  const excluded = new Set(['tray-header', 'tray-section', 'unreachable']);
  const loaded = scenes.filter((scene) => !excluded.has(scene));

  for (const name of loaded) {
    const pane = paneOf(name);
    const texts = drawnTexts(pane);

    expect(texts.filter((text) => text === 'diff in Greppa')).toHaveLength(1);
    expect(texts).toContain('9 changed');
    expect(texts).toContain('+412');
    expect(texts).toContain('−40');
    expect(texts.filter((text) => text === 'opens in Greppa')).toHaveLength(1);
  }
});

test('narrow facts keep one fact per row', () => {
  for (const name of ['blocked', 'tray-bar', 'ready', 'merge-failed', 'checks-failed']) {
    const grid = descendants(paneOf(name)).findLast((element) => {
      const texts = drawnTexts(element);

      return ['Branch', 'Ticket', 'Agent', 'diff in Greppa'].every((text) => texts.includes(text));
    });

    expect(grid).toBeDefined();

    const rows = descendants(grid!).filter((element) =>
      element.kids.some((child) =>
        ['Branch', 'Ticket', 'Agent', 'Files'].some((fact) => child.texts.includes(fact)),
      ),
    );

    expect(rows).toHaveLength(4);
    expect(drawnTexts(rows[0]!)).toContain('Branch');
    expect(drawnTexts(rows[0]!)).not.toContain('Ticket');
    expect(drawnTexts(rows[1]!)).toContain('Ticket');
    expect(drawnTexts(rows[1]!)).not.toContain('Agent');
    expect(drawnTexts(rows[2]!)).toContain('Agent');
    expect(drawnTexts(rows[3]!)).toContain('Files');
    expect(drawnTexts(rows[3]!)).toContain('diff in Greppa');

    expect(
      grid!.kids.some((child) => {
        const texts = drawnTexts(child);

        return texts.includes('Ticket') && texts.includes('Agent') && !texts.includes('Branch');
      }),
    ).toBe(false);
  }
});

test('a failed merge keeps its last sync context distinct from current failure', () => {
  const texts = drawnTexts(paneOf('merge-failed'));
  const previous = 'At the last sync: 4 checks passed · approved · 0 unresolved threads';

  expect(texts).toContain(previous);

  expect(texts.indexOf(previous)).toBeGreaterThan(
    texts.indexOf('main changed since the last sync'),
  );

  expect(texts.indexOf(previous)).toBeLessThan(texts.indexOf('Update branch and retry'));
  expect(texts).not.toContain('Ready to merge');
});

test('requested reviews have an amber review icon and a right-side state', () => {
  for (const name of ['blocked', 'tray-bar', 'sent', 'checks-failed', 'normal', 'zoomed']) {
    const review = descendants(paneOf(name)).findLast((element) => {
      const texts = drawnTexts(element);

      return texts.includes('Review from jonas-l') && texts.includes('changes requested');
    });

    expect(review).toBeDefined();
    expect(drawnTexts(review!)).toContain('changes requested');
    expect(drawnIcons(review!)).not.toContain('message-square');
    const tokens = name === 'normal' ? kojaNormal : koja;

    expect(elementWithIcon(review!, 'square-pen')?.textColors).toContain(tokens.marks.working);
  }
});

test('partial sync keeps one refresh control and warns beside the status', () => {
  const pane = paneOf('checks-failed');
  const texts = drawnTexts(pane);
  const warning = 'Could not sync checks · GitHub timed out';

  expect(texts).toContain('synced 1m ago · checks 6m ago');
  expect(texts).toContain(warning);
  expect(texts.indexOf(warning)).toBeLessThan(texts.indexOf('Branch'));
  expect(texts).not.toContain('Retry checks');
  expect(texts).not.toContain('Retry');
  expect(texts.filter((text) => text === 'Sync')).toHaveLength(1);
  expect(texts[texts.indexOf('Needs you') + 1]).toBe('3');
  expect(texts).not.toContain('Could not sync checks · showing checks from 6m ago');

  const note = descendants(pane).findLast(
    (element) =>
      drawnTexts(element).includes(warning) && drawnIcons(element).includes('triangle-alert'),
  );

  expect(note).toBeDefined();
});

test('picked reading areas use a persistent native overflow scrollbar', () => {
  for (const name of scenes.filter((scene) => !['tray-header', 'tray-section'].includes(scene))) {
    const parts = descendants(paneOf(name));
    const scrollbar = parts.find((element) => element.path === 'scrollbar/pr-reading');
    const reading = parts.find((element) => element.properties.id?.[0] === 'pr-reading');

    expect(scrollbar?.properties.mode).toEqual(['always']);
    expect(reading?.properties.overflow_y_scroll).toEqual([]);
    expect(reading?.properties.overflow_y_scrollbar).toBeUndefined();
  }
});

test('picked open states are unboxed and use state ink', () => {
  const loaded = scenes.filter(
    (scene) => !['tray-header', 'tray-section', 'unreachable'].includes(scene),
  );

  for (const name of loaded) {
    const state = descendants(paneOf(name)).findLast((element) =>
      element.kids.some((child) => child.texts.includes('open')),
    );

    const text = state?.kids.find((child) => child.texts.includes('open'));
    const tokens = name === 'normal' ? kojaNormal : koja;

    expect(state).toBeDefined();
    expect(state?.borderColors).toEqual([]);
    expect(state?.backgroundColors).toEqual([]);
    expect(text?.textColors).toContain(tokens.marks.done);
  }
});

test('merge retry states its effect and separates cause ink from snapshot ink', () => {
  const pane = paneOf('merge-failed');
  const texts = drawnTexts(pane);
  const effect = 'Squash and merge into main · deletes the branch';

  const cause = descendants(pane).find((element) =>
    element.texts.includes('main changed since the last sync'),
  );

  const snapshot = descendants(pane).find((element) =>
    element.texts.includes('At the last sync: 4 checks passed · approved · 0 unresolved threads'),
  );

  expect(texts).toContain(effect);
  expect(texts).toContain('Update branch and retry');
  expect(texts.indexOf(effect)).toBeGreaterThan(texts.indexOf('Update branch and retry'));
  expect(cause?.textColors.at(-1)).toBe(koja.ink.text);
  expect(snapshot?.textColors.at(-1)).toBe(koja.ink.dim);
  expect(cause?.properties.text_size).toEqual([koja.text.body.size]);
  expect(snapshot?.properties.text_size).toEqual([koja.text.detail.size]);
});

test('attention marks share a fixed centered slot', () => {
  const titles = ['typecheck', 'Review from jonas-l', 'rows.ts:48', 'repoLabel.ts:27–31'];

  for (const name of ['blocked', 'tray-bar', 'sent', 'checks-failed', 'normal', 'zoomed']) {
    for (const title of titles) {
      const row = descendants(paneOf(name)).findLast(
        (element) =>
          [24, 28].includes(Number(element.properties.h?.[0])) &&
          drawnTexts(element).includes(title),
      );

      const slot = row?.kids[0];

      expect(slot?.properties.w).toEqual([12]);
      expect(slot?.properties.h).toEqual([12]);
      expect(slot?.properties.items_center).toEqual([]);
      expect(slot?.properties.justify_center).toEqual([]);
    }
  }
});

test('picked dividers align with the body text column', () => {
  for (const name of ['blocked', 'tray-bar', 'ready', 'merge-failed', 'checks-failed']) {
    const parts = descendants(paneOf(name));
    const divider = parts.find((element) => element.properties.h?.[0] === 1);

    const header =
      parts.findLast(
        (element) =>
          drawnTexts(element).includes('Files') && drawnIcons(element).includes('chevron-right'),
      ) ??
      parts.findLast(
        (element) =>
          drawnTexts(element).includes('Files') && drawnIcons(element).includes('chevron-down'),
      );

    expect(header).toBeDefined();
    expect(divider?.properties.mx).toEqual([20]);
  }
});

test('picked Files headers leave aggregate counts in the facts only', () => {
  for (const name of scenes.filter(
    (scene) => !['tray-header', 'tray-section', 'unreachable'].includes(scene),
  )) {
    const header = descendants(paneOf(name)).findLast((element) => {
      const texts = drawnTexts(element);

      return texts.includes('Files') && texts.includes('opens in Greppa');
    });

    expect(drawnTexts(header!)).not.toContain('9');
    expect(drawnTexts(header!)).not.toContain('+412');
    expect(drawnTexts(header!)).not.toContain('−40');
  }
});

test('reviews own indented threads and equal-height add controls', () => {
  for (const name of ['blocked', 'tray-bar', 'sent', 'checks-failed', 'normal', 'zoomed']) {
    const parts = descendants(paneOf(name));

    const review = parts.findLast((element) => {
      const texts = drawnTexts(element);

      return texts.includes('Review from jonas-l') && texts.includes('rows.ts:48');
    });

    const nested = review?.kids.find((element) => element.properties.ml?.[0] === 18);

    const action = ['tray-bar', 'zoomed'].includes(name)
      ? 'Add rest for agent'
      : 'Add all for agent';

    const reviewAction = parts.findLast((element) =>
      element.kids.some((child) => child.texts.includes(action)),
    );

    const threadAction =
      nested &&
      descendants(nested).findLast((element) =>
        element.kids.some((child) => child.texts.includes('Add for agent')),
      );

    expect(nested?.kids).toHaveLength(2);
    expect(drawnTexts(nested!)).toContain('jonas-l · 2h ago');
    expect(drawnTexts(nested!)).toContain('jonas-l · 1h ago');

    expect(Number(reviewAction?.properties.h?.[0])).toBe(Number(threadAction?.properties.h?.[0]));
  }
});

test('scrolling content reserves an inset gutter and bottom section gap', () => {
  for (const name of ['blocked', 'tray-bar', 'ready', 'merge-failed', 'checks-failed', 'zoomed']) {
    const parts = descendants(paneOf(name));
    const reading = parts.find((element) => element.properties.id?.[0] === 'pr-reading');
    const scrollbar = parts.find((element) => element.path === 'scrollbar/pr-reading');
    const last = reading?.kids.at(-1);

    expect(reading?.properties.pr).toEqual([8]);
    expect(scrollbar?.properties.right).toEqual([6]);
    expect(scrollbar?.properties.viewport_from_layout).toEqual([]);
    const queued = ['tray-bar', 'zoomed'].includes(name);
    const padding = queued ? 0 : 8;
    const clearance = queued ? 8 : 0;
    const viewport = parts.find((element) => element.kids.includes(scrollbar!));

    expect(last?.properties.pb).toEqual([padding]);
    expect(viewport?.properties.mb).toEqual([clearance]);
    expect(reading?.properties.pb).toBeUndefined();
  }
});

test('merge heading marks align with top-level attention marks', () => {
  for (const name of ['blocked', 'merge-failed']) {
    const title = name === 'blocked' ? "Can't merge yet" : 'Could not merge';

    const heading = descendants(paneOf(name)).findLast(
      (element) => drawnTexts(element).includes(title) && drawnIcons(element).includes('circle-x'),
    );

    expect(heading?.properties.ml).toEqual([-18]);
  }
});

test('attention titles use one ink even when checks are stale', () => {
  for (const name of ['blocked', 'checks-failed', 'normal', 'zoomed']) {
    const parts = descendants(paneOf(name));
    const tokens = name === 'normal' ? kojaNormal : koja;

    for (const title of [
      'typecheck',
      'Review from jonas-l',
      'src/mods/koja-spaces/',
      'rows.ts:48',
      'src/kit/',
      'repoLabel.ts:27–31',
    ]) {
      const element = parts.find((part) => part.texts.includes(title));

      expect(element?.textColors.at(-1)).toBe(tokens.ink.text);
    }
  }
});

test('Sync has a larger gap than the state and status pair', () => {
  for (const name of [
    'blocked',
    'tray-bar',
    'ready',
    'merge-failed',
    'checks-failed',
    'normal',
    'zoomed',
  ]) {
    const parts = descendants(paneOf(name));

    const action = parts.findLast((element) =>
      element.kids.some((child) => child.texts.includes('Sync')),
    );

    const status = parts.findLast(
      (element) => drawnTexts(element).includes('open') && drawnTexts(element).includes('Sync'),
    );

    expect(status?.properties.gap).toEqual([8]);
    expect(action?.properties.ml).toEqual([2]);
  }
});

test('resolved scenes keep the same description gap and bottom padding', () => {
  for (const name of ['ready', 'merge-failed', 'ready-menu', 'merge-confirm']) {
    const description = descendants(paneOf(name)).findLast(
      (element) =>
        drawnTexts(element).includes('Description') && element.properties.mb !== undefined,
    );

    expect(description?.properties.mb).toEqual([8]);

    const reading = descendants(paneOf(name)).find(
      (element) => element.properties.id?.[0] === 'pr-reading',
    );

    expect(reading?.kids.at(-1)?.properties.pb).toEqual([8]);
  }
});

test('review ages sit beside their titles without a metadata row', () => {
  for (const name of ['blocked', 'tray-bar', 'sent', 'checks-failed', 'normal', 'zoomed']) {
    const review = descendants(paneOf(name)).findLast((element) => {
      const texts = drawnTexts(element);

      return texts.includes('Review from jonas-l') && texts.includes('rows.ts:48');
    });

    const titleRow = review?.kids[0];

    expect(drawnTexts(titleRow!)).toContain('2h ago');
    expect(review?.kids).toHaveLength(2);

    const titleGroup = descendants(titleRow!).findLast(
      (element) =>
        drawnTexts(element).includes('Review from jonas-l') &&
        drawnTexts(element).includes('2h ago'),
    );

    expect(drawnTexts(titleGroup!)).toEqual(['Review from jonas-l', '2h ago']);
  }
});

test('loaded bodies align their merge text and section dividers', () => {
  for (const name of [
    'blocked',
    'tray-bar',
    'sent',
    'checks-failed',
    'normal',
    'zoomed',
    'ready',
    'ready-menu',
    'merge-confirm',
    'merge-failed',
  ]) {
    const parts = descendants(paneOf(name));

    const dividers = parts.filter(
      (element) => element.properties.h?.[0] === 1 && element.properties.mx?.[0] === 20,
    );

    const merge = parts.find((element) => element.properties.pl?.[0] === 12);

    const resolved = ['ready', 'ready-menu', 'merge-confirm', 'merge-failed'].includes(name);
    const count = resolved ? 3 : 5;

    expect(dividers).toHaveLength(count);
    expect(merge).toBeDefined();
    let summary = '1 of 4 checks failing · 2 unresolved threads · changes requested';

    if (['ready', 'ready-menu', 'merge-confirm'].includes(name)) {
      summary = 'Squash and merge';
    }

    if (name === 'merge-failed') {
      summary = 'Update branch and retry';
    }

    expect(drawnTexts(merge!)).toContain(summary);
  }
});

test('queued tray edges align with item action edges', () => {
  for (const name of ['tray-bar', 'zoomed']) {
    const parts = descendants(paneOf(name));

    const tray = parts.findLast(
      (element) =>
        drawnTexts(element).includes('Send to agent') && element.properties.pr !== undefined,
    );

    const divider = parts.find(
      (element) => element.properties.h?.[0] === 1 && element.properties.mr !== undefined,
    );

    expect(tray?.properties.pr).toEqual([22]);
    expect(divider?.properties.mr).toEqual([22]);
  }
});

test('picked body sections have one divider between each neighboring pair', () => {
  for (const name of [
    'blocked',
    'tray-bar',
    'sent',
    'checks-failed',
    'normal',
    'zoomed',
    'ready',
    'ready-menu',
    'merge-confirm',
    'merge-failed',
  ]) {
    const reading = descendants(paneOf(name)).find(
      (element) => element.properties.id?.[0] === 'pr-reading',
    );

    const body = reading?.kids.at(-1);
    const resolved = ['ready', 'ready-menu', 'merge-confirm', 'merge-failed'].includes(name);
    const sections = body?.kids.filter((_, index) => index % 2 === 0);
    const dividers = body?.kids.filter((_, index) => index % 2 === 1);
    const count = resolved ? 3 : 5;

    expect(sections).toHaveLength(count);
    expect(dividers).toHaveLength(count - 1);

    for (const divider of dividers ?? []) {
      expect(divider.properties.h).toEqual([1]);
      expect(divider.properties.mx).toEqual([20]);
    }

    if (!resolved) {
      expect(drawnTexts(sections![1]!)).toContain('Needs you');
      expect(drawnTexts(sections![1]!)).not.toContain('Passed');
      expect(drawnTexts(sections![2]!)).toEqual(['Passed', '3 checks · 1 thread resolved']);
      expect(drawnIcons(sections![2]!)).toContain('chevron-right');
    }

    expect(drawnTexts(sections!.at(-2)!)).toContain('Description');
    expect(drawnTexts(sections!.at(-1)!)).toContain('Files');
  }
});

test('queued tray controls have equal heights and clear space above them', () => {
  for (const name of ['tray-bar', 'zoomed']) {
    const parts = descendants(paneOf(name));

    const clear = parts.findLast((element) =>
      element.kids.some((child) => child.texts.includes('Clear')),
    );

    const send = parts.findLast((element) =>
      element.kids.some((child) => child.texts.includes('Send to agent')),
    );

    const viewport = parts.find((element) =>
      element.kids.some((child) => child.path === 'scrollbar/pr-reading'),
    );

    expect(clear?.properties.h).toEqual(send?.properties.h);
    expect(clear?.properties.h).toEqual([28]);
    expect(viewport?.properties.mb).toEqual([8]);
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
    expect(texts).not.toContain('diff in Greppa');
    expect(texts).not.toContain("Can't merge yet");
    expect(texts).not.toContain('Changes requested');
    expect(texts.some((text) => text.startsWith('31  '))).toBe(false);
  }
});
