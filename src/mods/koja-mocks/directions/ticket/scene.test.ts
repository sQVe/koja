import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import {
  drawn,
  drawnIcons,
  drawnTexts,
  drawnTooltips,
  elementWithText,
  spinning,
} from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';
import { overlaySize } from '../../../../kit/size.ts';
import type { SceneName } from '../../catalog.ts';
import { findScene } from '../../catalog.ts';

type TicketState =
  Extract<SceneName, `ticket-view-${string}`> extends `ticket-view-${infer State}` ? State : never;

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    h_flex: () => drawn(),
    v_flex: () => drawn(),
    Scrollbar: { vertical: () => drawn() },
  }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));
await mock.module('herdr', () => herdrFake());

await mock.module('../../../../kit/index.ts', () =>
  kitIndexFake({
    icon: (name: string) => drawn(name),
    stateLine: (options: { text: string }) => {
      const line = drawn();

      line.texts.push(options.text);

      return line;
    },
  }),
);

const scenePath = './scene.ts';
const tokensPath = '../koja.ts';

const { ticketScene } = (await import(scenePath)) as {
  ticketScene: (state: string) => DrawnElement;
};

const { koja, kojaNormal } = (await import(tokensPath)) as {
  koja: {
    ink: { dim: string };
    marks: { done: string; working: string; idle: string };
    rows: { selectedFill: string };
  };
  kojaNormal: { pane: { focusedBorder: string; focusedHeaderFill: string } };
};

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

const paneOf = (state: string): DrawnElement => {
  const pane = descendants(ticketScene(state)).find((part) =>
    part.kids.some((child) => child.kids.some((label) => label.texts.includes('Ticket'))),
  );

  if (pane === undefined) {
    throw new Error(`No ticket pane in ${state}`);
  }

  return pane;
};

const regionWith = (pane: DrawnElement, first: string, second: string): DrawnElement => {
  const region = descendants(pane).findLast((part) => {
    const texts = drawnTexts(part);

    return texts.includes(first) && texts.includes(second);
  });

  if (region === undefined) {
    throw new Error(`No region containing ${first} and ${second}`);
  }

  return region;
};

const trackColors = (pane: DrawnElement): string[] => {
  const track = descendants(pane).find((part) =>
    part.kids.some((child) => child.texts.some((text) => /^\d+ of \d+ merged$/.test(text))),
  );

  const segments = track?.kids.find(
    (part) =>
      part.kids.length >= 7 && part.kids.every((child) => child.backgroundColors.length === 1),
  );

  return segments?.kids.flatMap((part) => part.backgroundColors) ?? [];
};

const states = [
  'container',
  'single',
  'loading',
  'unreachable',
  'sync-failed',
  'nothing-ready',
  'done',
  'plain',
  'tikk',
  'long',
  'normal',
  'wide',
] satisfies TicketState[];

afterAll(() => {
  mock.restore();
});

describe('ticket scenes', () => {
  test('all twelve view states open at the shell size', () => {
    for (const state of states) {
      const name: SceneName = `ticket-view-${state}`;

      expect(findScene(name)).toEqual({
        scene: { name, width: overlaySize.shellWidth, height: overlaySize.shellHeight },
      });
    }
  });

  test('earlier round scene names no longer open', () => {
    for (const take of ['document', 'plan', 'board', 'tree', 'refined', 'focus', 'nested']) {
      expect(findScene(`ticket-${take}-container`)).toHaveProperty('error');
      expect(findScene(`ticket-${take}-single`)).toHaveProperty('error');
    }
  });
});

describe('ticket view rendering', () => {
  test.each(['container', 'single', 'sync-failed', 'tikk', 'long', 'normal', 'wide'])(
    '%s keeps tracker status only in the item chip',
    (state) => {
      const texts = drawnTexts(paneOf(state));

      expect(texts).not.toContain('in review');
      expect(texts).toContain('PR open');
      expect(texts).toContain('PR draft');
      expect(texts.some((text) => /^(?:In Progress|Backlog|open) ·/.test(text))).toBe(false);
      expect(texts).not.toContain('In Progress');
    },
  );

  test('container Now names the work and PRs without repeating slice identifiers', () => {
    const pane = paneOf('container');
    const now = regionWith(pane, 'Now', 'koja #59 · GitHub');
    const texts = drawnTexts(now);

    expect(texts).toContain('Add the space footer links');
    expect(texts).toContain('checks passing · 1 unresolved thread');
    expect(texts).toContain('Design the sidebar');
    expect(drawnIcons(now)).toContain('terminal');
    expect(texts).not.toContain('ME-1283');
    expect(texts).not.toContain('ME-1284');
    expect(texts.filter((text) => text === 'PR open')).toHaveLength(1);
    expect(texts.filter((text) => text === 'PR draft')).toHaveLength(1);
    expect(drawnTexts(pane).filter((text) => text === 'koja #58 · GitHub')).toHaveLength(1);
    expect(drawnTexts(pane).filter((text) => text === 'koja #59 · GitHub')).toHaveLength(1);
  });

  test('single puts all acceptance before the parent plan and has no separate Next', () => {
    const pane = paneOf('single');
    const texts = drawnTexts(pane);
    const parent = texts.indexOf('ME-1280 Build the sidebar');

    expect(texts.indexOf('Now')).toBeLessThan(texts.indexOf('Acceptance'));
    expect(texts.indexOf('Acceptance')).toBeLessThan(parent);
    expect(texts.indexOf('The footer truncates a long branch')).toBeLessThan(parent);
    expect(texts.indexOf('2 of 7 merged')).toBeGreaterThan(parent);
    expect(texts).toContain('2 of 5');
    expect(texts).not.toContain('Next');
    expect(texts).toContain('next');
    expect(texts.filter((text) => text === 'ME-1283 · Linear')).toHaveLength(1);
    expect(texts.filter((text) => text === 'koja #58 · GitHub')).toHaveLength(1);
    expect(texts).toContain('AI-413 Route ticket links to the tracker');
  });

  test('the plan names its source once and unfolds only the first active slice', () => {
    const pane = paneOf('container');
    const texts = drawnTexts(pane);

    expect(texts).toContain('Whole plan');
    expect(texts).toContain('· Linear');

    for (let number = 1281; number <= 1287; number += 1) {
      expect(texts.filter((text) => text === `ME-${number}`)).toHaveLength(1);
      expect(texts).not.toContain(`ME-${number} · Linear`);
    }

    expect(texts).toContain('AI-412');
    expect(texts).not.toContain('AI-418');
    expect(drawnIcons(regionWith(pane, 'ME-1284', 'PR draft'))).toContain('chevron-right');
    expect(elementWithText(pane, '· Linear')?.textColors).toEqual([koja.ink.dim]);
    expect(drawnTooltips(pane)).toContain('ME-1281 · Linear');
  });

  test('the progress track reserves color for merged and active work and counts each state', () => {
    const pane = paneOf('container');
    const colors = trackColors(pane);
    const texts = drawnTexts(pane);

    expect(colors.slice(0, 4)).toEqual([
      koja.marks.done,
      koja.marks.done,
      koja.marks.working,
      koja.marks.working,
    ]);

    expect(colors).toHaveLength(7);
    expect(colors[4]).toBe(colors[5]);
    expect(colors[5]).toBe(colors[6]);

    for (const count of ['2 merged', '2 active', '1 next', '2 blocked']) {
      expect(texts).toContain(count);
    }
  });

  test('sync failure precedes the track and covers the whole summary once', () => {
    const pane = paneOf('sync-failed');
    const texts = drawnTexts(pane);
    const failure = 'Could not sync PRs · showing PR states from 6m ago';

    expect(texts.indexOf(failure)).toBeLessThan(texts.indexOf('2 of 7 merged'));
    expect(texts.filter((text) => text.includes('6m ago'))).toHaveLength(1);
    expect(texts).toContain('Retry');
    expect(texts).toContain('synced 1m ago');
    expect(elementWithText(pane, 'PR open')?.textColors).toEqual([koja.ink.dim]);
    expect(spinning(pane)).toBe(false);
  });

  test('nothing ready identifies the external blocker by title and work state', () => {
    const pane = paneOf('nothing-ready');
    const texts = drawnTexts(pane);

    expect(texts).toContain('Nothing is ready');
    expect(texts).toContain('ME-1285 waits for');
    expect(texts).toContain('ME-1290');
    expect(texts).toContain('Add the sidebar data model');
    expect(texts).toContain('not started');
    expect(texts).toContain('no PR');
    expect(texts).toContain('4 of 7 merged');
    expect(texts).not.toContain('0 active');
    expect(texts).not.toContain('0 next');
  });

  test('Next and blocked rows name their dependencies without duplicating links', () => {
    const texts = drawnTexts(paneOf('container'));

    expect(texts).toContain('Ready · waits on ME-1283, stacks on koja #58');
    expect(texts).toContain('by ME-1285');
    expect(texts).toContain('by ME-1286');
    expect(texts.filter((text) => text === 'koja #58 · GitHub')).toHaveLength(1);
  });

  test('tikk keeps its own item status and source with the same slice vocabulary', () => {
    const texts = drawnTexts(paneOf('tikk'));

    expect(texts).toContain('koja-7fq3 · tikk');
    expect(texts).toContain('· tikk');
    expect(texts).toContain('koja-m4rd');
    expect(texts).toContain('koja-a4dm');
    expect(texts.filter((text) => text === 'open')).toHaveLength(1);
    expect(texts.join('\n')).not.toMatch(/Linear|\b(?:ME|AI)-\d+/);
  });

  test.each(['loading', 'unreachable'])('%s has no invented facts, age, or summary', (state) => {
    const texts = drawnTexts(paneOf(state));

    expect(texts).toContain('ME-1280 · Linear');

    for (const absent of [
      'Build the sidebar',
      'Project',
      'synced 1m ago',
      'Now',
      'Next',
      'Whole plan',
    ]) {
      expect(texts).not.toContain(absent);
    }

    expect(texts.includes('Retry')).toBe(state === 'unreachable');
  });

  test('done folds the plan, omits zero counts, and uses a check in the state chip', () => {
    const pane = paneOf('done');
    const texts = drawnTexts(pane);
    const label = elementWithText(pane, 'Done');
    const chip = descendants(pane).find((part) => part.kids.includes(label!));

    expect(drawnIcons(chip!)).toEqual(['check']);
    expect(texts).toContain('7 of 7 merged');
    expect(texts).not.toContain('Now');
    expect(texts).not.toContain('Next');
    expect(texts).not.toContain('0 active');
    expect(texts).not.toContain('ME-1281');
  });

  test('plain has only content sections and no empty plan', () => {
    const texts = drawnTexts(paneOf('plain'));

    expect(texts).toContain('Description');
    expect(texts).toContain('Acceptance');
    expect(texts).toContain('0 of 2');
    expect(texts).not.toContain('Now');
    expect(texts).not.toContain('Whole plan');
  });

  test('long keeps fourteen slices and full title tooltips', () => {
    const pane = paneOf('long');
    const texts = drawnTexts(pane);
    const identifiers = texts.filter((text) => /^ME-(?:128[1-7]|131[0-6])$/.test(text));

    expect(identifiers).toHaveLength(14);
    expect(texts).toContain('2 of 14 merged');

    expect(drawnTooltips(pane)).toContain(
      'Add the selected space footer links for tickets and pull requests across repositories',
    );
  });

  test('normal changes the focus treatment without changing ticket content', () => {
    const pane = paneOf('normal');

    expect(drawnTexts(pane)).toEqual(drawnTexts(paneOf('container')));
    expect(pane.borderColors).toContain(kojaNormal.pane.focusedBorder);
  });

  test('wide retains summaries and their PR links only in the rail', () => {
    const pane = paneOf('wide');

    const columns = descendants(pane).find(
      (part) =>
        part.kids.length === 2 &&
        drawnTexts(part.kids[0]!).includes('Whole plan') &&
        drawnTexts(part.kids[1]!).includes('Project'),
    );

    const reading = drawnTexts(columns!.kids[0]!);
    const rail = drawnTexts(columns!.kids[1]!);

    expect(reading).not.toContain('Now');
    expect(reading).not.toContain('Next');
    expect(reading).toContain('Acceptance');
    expect(rail.indexOf('Now')).toBeGreaterThan(rail.indexOf('Project'));
    expect(rail.indexOf('Next')).toBeGreaterThan(rail.indexOf('Now'));
    expect(rail).toContain('Add the space footer links');
    expect(rail.filter((text) => text === 'koja #58 · GitHub')).toHaveLength(1);
    expect(reading).not.toContain('koja #58 · GitHub');
  });

  test.each(states)('%s adds no refresh action or key hints', (state) => {
    const pane = paneOf(state);

    expect(drawnTexts(pane)).not.toContain('Refresh');
    expect(drawnIcons(pane)).not.toContain('refresh-cw');
  });
});
