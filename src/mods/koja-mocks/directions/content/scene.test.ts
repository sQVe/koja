import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import {
  drawn,
  drawnIcons,
  drawnTexts,
  drawnTooltips,
  spinning,
} from '../../../../../tests/drawn.ts';
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

const { contentScene } = (await import(scenePath)) as {
  contentScene: (scene: string) => DrawnElement;
};

const { kojaNormal } = (await import(tokensPath)) as {
  kojaNormal: { pane: { focusedBorder: string; focusedHeaderFill: string } };
};

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

const paneOf = (scene: string, kind: string): DrawnElement => {
  const pane = descendants(contentScene(scene)).find((part) =>
    part.kids.some((child) => child.kids.some((label) => label.texts.includes(kind))),
  );

  if (pane === undefined) {
    throw new Error(`No ${kind} pane in ${scene}`);
  }

  return pane;
};

const sharedRegion = (element: DrawnElement, first: string, second: string): DrawnElement => {
  const parts = descendants(element).filter((part) => {
    const texts = drawnTexts(part);

    return texts.includes(first) && texts.includes(second);
  });

  return parts.at(-1) ?? drawn();
};

const items = [
  {
    scene: 'review',
    kind: 'Draft review',
    identifier: 'ME-1092',
    other: [],
    tab: 'Review design.md',
    icon: 'square-pen',
  },
  {
    scene: 'pr',
    kind: 'Pull request',
    identifier: '#41',
    other: ['ME-1090'],
    tab: '#41 Design the sidebar',
    icon: 'git-compare',
  },
  {
    scene: 'ticket',
    kind: 'Ticket',
    identifier: 'ME-1094',
    other: ['ME-1087', '#52'],
    tab: 'ME-1094 Design the ticket view',
    icon: 'file',
  },
];

afterAll(() => {
  mock.restore();
});

describe('Rail content scenes', () => {
  test.each(items)('$scene links each outside target once in the pane', (item) => {
    const texts = drawnTexts(paneOf(item.scene, item.kind));

    expect(texts.filter((text) => text === item.identifier)).toHaveLength(1);

    for (const identifier of item.other) {
      expect(texts.filter((text) => text === identifier)).toHaveLength(1);
    }

    expect(texts).not.toContain('Open ticket');
    expect(texts).not.toContain('Open on GitHub');
    expect(texts).not.toContain('Open in Linear');
    expect(texts).not.toContain('#52 · Ticket view frame');
  });

  test.each(items)('$scene keeps the item link before its state and reading content', (item) => {
    const texts = drawnTexts(paneOf(item.scene, item.kind));
    const state = item.scene === 'ticket' ? 'Backlog' : 'open';
    const reading = item.scene === 'review' ? '# Content pane pattern' : 'Description';

    expect(texts.indexOf(item.identifier)).toBeLessThan(texts.indexOf(state));
    expect(texts.indexOf(state)).toBeLessThan(texts.indexOf(reading));
  });

  test.each(items)('$scene keeps its kind icon in the item tab', (item) => {
    const scene = contentScene(item.scene);

    const tab = descendants(scene).find((part) =>
      part.kids.some((child) => child.texts.includes(item.tab)),
    );

    expect(tab).toBeDefined();
    expect(drawnIcons(tab!)).toEqual([item.icon, 'x']);
  });

  test('the base review keeps its own tab, action, files, and comments', () => {
    const texts = drawnTexts(contentScene('review'));

    expect(texts).not.toContain('> bun run check');
    expect(texts).toContain('Done');
    expect(texts).toContain('slice-1.md');
    expect(texts).toContain('slice-2.md');
    expect(texts).toContain('L6');
    expect(texts).toContain('L12–14');
    expect(texts).toContain('Insert');
    expect(texts).not.toContain('Normal');
  });

  test('a failed review save keeps edits and comments while disabling Done', () => {
    const pane = paneOf('review-saving-failed', 'Draft review');
    const texts = drawnTexts(pane);
    const disabled = descendants(pane).filter((part) => part.isDisabled);
    const action = sharedRegion(pane, 'Could not save', 'Done');

    expect(texts).toContain('The item keeps your edits until you send it.');
    expect(texts).toContain('Unsaved');
    expect(texts).toContain('Your edits are kept');
    expect(texts).toContain('L6');
    expect(texts).toContain('L12–14');
    expect(disabled).toHaveLength(1);
    expect(drawnTexts(disabled[0]!)).toContain('Done');
    expect(disabled[0]!.clickHandlers).toHaveLength(0);
    expect(drawnTexts(action)).toContain('Retry');
    expect(drawnTexts(action)).not.toContain('# Content pane pattern');

    expect(drawnTexts(contentScene('review'))).toContain(
      'The item owns its title, state, and actions.',
    );
  });

  test('a sent review retains read-only text and comments without Done', () => {
    const texts = drawnTexts(paneOf('review-sent', 'Draft review'));

    expect(texts).toContain('Review sent to Tau');
    expect(texts).toContain('Tau closes this pane after collecting the review.');
    expect(texts).not.toContain('Done');
    expect(texts.filter((text) => text === 'Read-only')).toHaveLength(3);
    expect(texts).toContain('# Content pane pattern');
    expect(texts).toContain('L6');
    expect(texts).toContain('L12–14');
  });

  test('the narrow review puts files and Done before the document beside the terminal', () => {
    const scene = contentScene('review-narrow');
    const texts = drawnTexts(scene);
    const document = texts.indexOf('# Content pane pattern');
    const toolbar = sharedRegion(scene, 'Done', 'slice-2.md');

    expect(texts).toContain('> bun run check');
    expect(texts.indexOf('Done')).toBeGreaterThan(-1);
    expect(texts.indexOf('Done')).toBeLessThan(document);
    expect(texts.indexOf('slice-2.md')).toBeLessThan(document);
    expect(drawnTexts(toolbar)).not.toContain('# Content pane pattern');
  });

  test('failed checks keep last-good rows with age and a local Retry without busy marks', () => {
    const pane = paneOf('pr-checks-failed', 'Pull request');
    const texts = drawnTexts(pane);
    const checks = sharedRegion(pane, 'Could not read checks · checks from 6m ago', 'typecheck');

    expect(texts).toContain('Type mismatch in rows.ts:48');
    expect(texts).toContain('tests');
    expect(texts).toContain('style');
    expect(texts).toContain('Threads 2');
    expect(texts).toContain('Files 9');
    expect(drawnTexts(checks)).toContain('Retry');
    expect(drawnTexts(checks)).not.toContain('Threads 2');
    expect(drawnIcons(checks)).not.toContain('loader-circle');
    expect(spinning(checks)).toBe(false);
    expect(drawnIcons(paneOf('pr', 'Pull request'))).toContain('loader-circle');
  });

  test('an unreachable PR shows only its known identity and a retryable read error', () => {
    const texts = drawnTexts(paneOf('pr-unreachable', 'Pull request'));

    expect(texts).toContain('#41');
    expect(texts).toContain('Could not read PR · GitHub is unreachable');
    expect(texts.filter((text) => text === 'Retry')).toHaveLength(1);
    expect(texts).not.toContain('Design the sidebar');
    expect(texts).not.toContain('open');
    expect(texts).not.toContain('Description');
    expect(texts).not.toContain('Checks 3');
  });

  test('a first ticket read shows its known identifier and a loading line without invented facts', () => {
    const texts = drawnTexts(paneOf('ticket-loading', 'Ticket'));

    expect(texts).toContain('ME-1094');
    expect(texts).toContain('Loading ticket');
    expect(texts).not.toContain('Design the ticket view');
    expect(texts).not.toContain('Backlog');
    expect(texts).not.toContain('Project');
    expect(texts).not.toContain('Slices 3');
    expect(texts).not.toContain('Retry');
  });

  test('the long ticket keeps its title, parent, extra facts, and three distinct PR links', () => {
    const pane = paneOf('ticket-long', 'Ticket');
    const texts = drawnTexts(pane);
    const parent = texts.find((text) => text.startsWith('ME-1087 ·'));

    expect(parent).toBeDefined();
    expect(drawnTooltips(pane)).toContain(parent!);
    expect(texts.some((text) => text.includes('long titles, related pull requests'))).toBe(true);
    expect(texts.some((text) => text.includes('ME-1087 · Build the developer cockpit'))).toBe(true);

    for (const fact of ['Labels', 'Assignee', 'Cycle', 'Estimate', '#52', '#57', '#63']) {
      expect(texts.filter((text) => text === fact)).toHaveLength(1);
    }

    expect(texts).toContain('Slices 3');
  });

  test('normal mode focuses the content pane with indigo borders and a tinted header', () => {
    const scene = contentScene('pr-normal');
    const pane = paneOf('pr-normal', 'Pull request');
    const texts = drawnTexts(scene);
    const fills = descendants(pane).flatMap((part) => part.backgroundColors);

    expect(texts).toContain('Normal');
    expect(texts).not.toContain('Insert');
    expect(texts).toContain('> bun run check');
    expect(pane.borderColors).toContain(kojaNormal.pane.focusedBorder);
    expect(fills).toContain(kojaNormal.pane.focusedHeaderFill);
  });
});
