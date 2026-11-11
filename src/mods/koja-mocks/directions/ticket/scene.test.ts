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
import { findScene } from '../../catalog.ts';

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
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
const partsPath = './parts.ts';

const { workRow } = (await import(partsPath)) as {
  workRow: (item: unknown, source: string, tokens: unknown) => DrawnElement;
};

const { ticketScene } = (await import(scenePath)) as {
  ticketScene: (state: string) => DrawnElement;
};

const { koja, kojaNormal } = (await import(tokensPath)) as {
  koja: {
    ink: { dim: string };
    marks: { done: string; working: string; idle: string; blocked: string };
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

const trackColors = (pane: DrawnElement): string[] => {
  const track = descendants(pane).find((part) =>
    part.kids.some((child) => child.texts.some((text) => /^\d+ of \d+ merged$/.test(text))),
  );

  if (track === undefined) {
    return [];
  }

  return descendants(track).flatMap((part) => part.backgroundColors);
};

const sourceLinks = (pane: DrawnElement): string[] =>
  drawnTexts(pane).filter((text) => / · (?:Linear|GitHub|tikk)$/.test(text));

const scenes = [
  'ticket-view-container',
  'ticket-view-single',
  'ticket-view-loading',
  'ticket-view-unreachable',
  'ticket-view-sync-failed',
  'ticket-view-nothing-ready',
  'ticket-view-done',
  'ticket-view-plain',
  'ticket-view-tikk',
  'ticket-view-long',
  'ticket-view-normal',
  'ticket-view-wide',
] as const;

const removedTakes = ['document', 'plan', 'board', 'tree', 'refined', 'focus', 'nested'];

afterAll(() => {
  mock.restore();
});

describe('ticket scenes', () => {
  test('all twelve view states open at the shell size', () => {
    for (const name of scenes) {
      expect(findScene(name)).toEqual({
        scene: { name, width: overlaySize.shellWidth, height: overlaySize.shellHeight },
      });
    }
  });

  test('earlier round scene names no longer open', () => {
    for (const take of removedTakes) {
      expect(findScene(`ticket-${take}-container`)).toHaveProperty('error');
      expect(findScene(`ticket-${take}-single`)).toHaveProperty('error');
    }
  });
});

describe('ticket view rendering', () => {
  test('the container links each target once and keeps plan order below Now and Next', () => {
    const pane = paneOf('container');
    const texts = drawnTexts(pane);
    const links = sourceLinks(pane);
    const plan = links.filter((text) => /^ME-128[1-7] · Linear$/.test(text));

    expect(new Set(links).size).toBe(links.length);
    expect(plan).toEqual(Array.from({ length: 7 }, (_, index) => `ME-${1281 + index} · Linear`));
    expect(links).toContain('koja #58 · GitHub');
    expect(links).toContain('koja #59 · GitHub');
    expect(links.filter((text) => text.startsWith('AI-'))).toHaveLength(6);
    expect(texts.indexOf('Now')).toBeLessThan(texts.indexOf('Next'));
    expect(texts.indexOf('Next')).toBeLessThan(texts.indexOf('Whole plan'));
    expect(texts.indexOf('Whole plan')).toBeLessThan(texts.indexOf('Description'));
    expect(texts).toContain('In Progress · PR open · checks passing · 1 unresolved thread');
    expect(texts).toContain('in review');

    expect(trackColors(pane)).toEqual([
      koja.marks.done,
      koja.marks.done,
      koja.marks.working,
      koja.marks.working,
      koja.marks.idle,
      koja.marks.blocked,
      koja.marks.blocked,
    ]);
  });

  test('the single unfolds only its agents and keeps their links out of Now', () => {
    const pane = paneOf('single');
    const texts = drawnTexts(pane);
    const links = sourceLinks(pane);

    const selected = descendants(pane).filter((part) =>
      part.backgroundColors.includes(koja.rows.selectedFill),
    );

    expect(new Set(links).size).toBe(links.length);

    expect(links.filter((text) => text.startsWith('AI-'))).toEqual([
      'AI-412 · Linear',
      'AI-413 · Linear',
      'AI-414 · Linear',
    ]);

    expect(texts).toContain('AI-413 Route ticket links to the tracker');

    expect(texts.indexOf('AI-413 Route ticket links to the tracker')).toBeLessThan(
      texts.indexOf('Whole plan'),
    );

    expect(texts.indexOf('Whole plan')).toBeLessThan(texts.indexOf('AI-413 · Linear'));
    expect(texts.indexOf('ME-1280 Build the sidebar')).toBeLessThan(texts.indexOf('2 of 7 merged'));
    expect(texts.indexOf('Next')).toBeLessThan(texts.indexOf('ME-1285'));
    expect(selected.some((part) => drawnTexts(part).includes('ME-1283'))).toBe(true);
    expect(texts.indexOf('Acceptance')).toBeLessThan(texts.indexOf('Relations'));
    expect(texts.indexOf('Relations')).toBeLessThan(texts.indexOf('Description'));
    expect(texts.indexOf('Description')).toBeLessThan(texts.indexOf('Activity'));
  });

  test.each(['loading', 'unreachable'])('%s shows no invented facts, age, or plan', (state) => {
    const texts = drawnTexts(paneOf(state));

    expect(texts).toContain('ME-1280 · Linear');

    for (const absent of [
      'Build the sidebar',
      'Project',
      'synced 1m ago',
      'Now',
      'Next',
      'Whole plan',
      'Description',
    ]) {
      expect(texts).not.toContain(absent);
    }
  });

  test('loading uses the loading line without a retry action', () => {
    const texts = drawnTexts(paneOf('loading'));

    expect(texts).toContain('Loading ticket');
    expect(texts).not.toContain('Retry');
  });

  test('unreachable names the failed source and offers Retry', () => {
    const texts = drawnTexts(paneOf('unreachable'));

    expect(texts).toContain('Could not read ticket · Linear is unreachable');
    expect(texts).toContain('Retry');
    expect(texts).not.toContain('Loading ticket');
  });

  test('failed PR sync retains ticket facts and marks stale PR-derived guidance', () => {
    const pane = paneOf('sync-failed');
    const texts = drawnTexts(pane);
    const failure = 'Could not sync PRs · showing PR states from 6m ago';
    const next = 'Backlog · Ready · stacks on koja #58 · uses PR states from 6m ago';

    expect(texts).toContain('synced 1m ago');
    expect(texts).toContain('Project');
    expect(texts).toContain('Retry');
    expect(texts.indexOf(failure)).toBeGreaterThan(texts.indexOf('Now'));
    expect(texts.indexOf(failure)).toBeLessThan(texts.indexOf('Next'));
    expect(texts).toContain(next);
    expect(elementWithText(pane, 'in review')?.textColors).toEqual([koja.ink.dim]);

    expect(
      elementWithText(pane, 'In Progress · PR open · checks passing · 1 unresolved thread')
        ?.textColors,
    ).toEqual([koja.ink.dim]);

    expect(spinning(pane)).toBe(false);
  });

  test('nothing ready keeps the four merged slices and links the external blocker once', () => {
    const pane = paneOf('nothing-ready');
    const texts = drawnTexts(pane);
    const links = sourceLinks(pane);

    expect(texts).toContain('4 of 7 merged');
    expect(texts).toContain('No slices in progress');
    expect(texts).toContain('Nothing is ready');
    expect(texts).toContain('ME-1285 is blocked by');
    expect(links.filter((text) => text === 'ME-1290 · Linear')).toHaveLength(1);
    expect(texts).toContain('· no PR');
    expect(links.some((text) => text.endsWith(' · GitHub'))).toBe(false);

    expect(trackColors(pane)).toEqual([
      koja.marks.done,
      koja.marks.done,
      koja.marks.done,
      koja.marks.done,
      koja.marks.blocked,
      koja.marks.blocked,
      koja.marks.blocked,
    ]);
  });

  test('done folds the merged plan and removes action guidance', () => {
    const pane = paneOf('done');
    const texts = drawnTexts(pane);

    expect(texts).toContain('Done');
    expect(texts).toContain('7 of 7 merged');
    expect(texts).toContain('All slices merged');
    expect(texts).toContain('7 merged');
    expect(texts).not.toContain('Now');
    expect(texts).not.toContain('Next');
    expect(texts).not.toContain('ME-1281 · Linear');
    expect(trackColors(pane)).toEqual(Array.from({ length: 7 }, () => koja.marks.done));
  });

  test('done uses the done check in its state chip', () => {
    const pane = paneOf('done');
    const label = elementWithText(pane, 'Done');
    const chip = descendants(pane).find((part) => part.kids.includes(label!));

    expect(chip).toBeDefined();
    expect(drawnIcons(chip!)).toEqual(['check']);
  });

  test('instruction rows read stored status from data and keep readiness separate', () => {
    const instruction = workRow(
      {
        identifier: 'koja-b6kr',
        title: 'Route ticket links to the tracker',
        state: 'in progress',
        tracker: 'draft',
      },
      'tikk',
      koja,
    );

    const texts = drawnTexts(instruction);

    expect(texts).toContain('draft');
    expect(texts).toContain('in progress');
    expect(texts).not.toContain('open');
  });

  test('a plain ticket has content without empty plan or relation sections', () => {
    const pane = paneOf('plain');
    const texts = drawnTexts(pane);

    expect(sourceLinks(pane)).toEqual(['ME-1301 · Linear']);
    expect(texts).toContain('Backlog');
    expect(texts).toContain('Description');
    expect(texts).toContain('Acceptance');
    expect(texts).toContain('0 of 2');

    for (const absent of ['Now', 'Next', 'Whole plan', 'Relations', 'Activity']) {
      expect(texts).not.toContain(absent);
    }

    expect(trackColors(pane)).toEqual([]);
  });

  test('tikk uses tikk ticket and instruction links without Linear facts', () => {
    const pane = paneOf('tikk');
    const texts = drawnTexts(pane);
    const links = sourceLinks(pane);
    const tickets = links.filter((text) => /^koja-[a-z0-9]{4} · tikk$/.test(text));

    expect(tickets).toHaveLength(15);
    expect(new Set(links).size).toBe(links.length);
    expect(links).toContain('koja-7fq3 · tikk');
    expect(links).toContain('koja-a4dm · tikk');
    expect(links).toContain('koja #58 · GitHub');
    expect(texts.join('\n')).not.toMatch(/Linear|\b(?:ME|AI)-\d+|In [Pp]rogress|Backlog/);
    expect(texts).toContain('open · PR open · checks passing · 1 unresolved thread');
    expect(texts).toContain('open · Ready · stacks on koja #58');
    expect(texts.filter((text) => text === 'open')).toHaveLength(7);
    expect(texts).toContain('in review');
    expect(texts).toContain('in progress');

    expect(texts).toContain('open · PR draft · stacked on koja #58 · 2 of 3 instructions done');
  });

  test('a long plan keeps guidance before fourteen slices and retains full title tooltips', () => {
    const pane = paneOf('long');
    const texts = drawnTexts(pane);

    const links = sourceLinks(pane).filter((text) =>
      /^ME-(?:128[1-7]|131[0-6]) · Linear$/.test(text),
    );

    const titles = texts.filter((text) => text.length > 60 && !text.includes(' · '));
    const tooltips = drawnTooltips(pane);

    expect(texts).toContain('2 of 14 merged');
    expect(links).toHaveLength(14);
    expect(texts.indexOf('Now')).toBeLessThan(texts.indexOf('Whole plan'));
    expect(texts.indexOf('Next')).toBeLessThan(texts.indexOf('Whole plan'));
    expect(titles.length).toBeGreaterThan(1);

    for (const title of titles) {
      expect(tooltips).toContain(title);
    }
  });

  test('normal mode changes the focus treatment without changing ticket content', () => {
    const pane = paneOf('normal');

    expect(drawnTexts(pane)).toEqual(drawnTexts(paneOf('container')));
    expect(drawnTexts(ticketScene('normal'))).toContain('Normal');
    expect(pane.borderColors).toContain(kojaNormal.pane.focusedBorder);

    expect(descendants(pane).flatMap((part) => part.backgroundColors)).toContain(
      kojaNormal.pane.focusedHeaderFill,
    );
  });

  test('wide moves Now and Next below facts in the rail', () => {
    const scene = ticketScene('wide');
    const pane = paneOf('wide');
    const texts = drawnTexts(pane);

    expect(drawnTexts(scene)).not.toContain('> bun run check');
    expect(texts.filter((text) => text === 'ME-1090 · Linear')).toHaveLength(1);
    expect(texts.indexOf('Project')).toBeGreaterThan(texts.indexOf('Acceptance · 1 of 3'));

    const columns = descendants(pane).find(
      (part) =>
        part.kids.length === 2 &&
        drawnTexts(part.kids[0]!).includes('Whole plan') &&
        drawnTexts(part.kids[1]!).includes('Project'),
    );

    expect(columns).toBeDefined();

    const reading = drawnTexts(columns!.kids[0]!);
    const rail = drawnTexts(columns!.kids[1]!);

    expect(reading).not.toContain('Now');
    expect(reading).not.toContain('Next');
    expect(reading).toContain('Build the sidebar');
    expect(reading).toContain('2 of 7 merged');
    expect(reading).toContain('Description');
    expect(reading).toContain('Acceptance · 1 of 3');
    expect(rail.indexOf('Now')).toBeGreaterThan(rail.indexOf('Project'));
    expect(rail.indexOf('Next')).toBeGreaterThan(rail.indexOf('Now'));
    expect(rail.filter((text) => text === 'koja #58 · GitHub')).toHaveLength(1);
    expect(rail.filter((text) => text === 'koja #59 · GitHub')).toHaveLength(1);
    expect(reading).not.toContain('koja #58 · GitHub');
    expect(reading).not.toContain('koja #59 · GitHub');

    const wideLinks = sourceLinks(pane).toSorted();
    const containerLinks = sourceLinks(paneOf('container')).toSorted();

    expect(wideLinks).toEqual(containerLinks);
  });
});
