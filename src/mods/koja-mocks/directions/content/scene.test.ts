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

const { contentScene } = (await import(scenePath)) as {
  contentScene: (scene: string) => DrawnElement;
};

const { checkMark } = (await import(partsPath)) as {
  checkMark: (state: string, tokens: unknown) => DrawnElement;
};

const { koja, kojaNormal } = (await import(tokensPath)) as {
  koja: { ink: { text: string; dim: string } };
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
    identifier: 'ME-1090 · Linear',
    state: 'in review',
    other: [],
    tab: 'Review design.md',
    icon: 'square-pen',
  },
  {
    scene: 'pr',
    kind: 'Pull request',
    identifier: 'koja #41 · GitHub',
    state: 'open',
    other: ['ME-1090 · Linear'],
    tab: '#41 Design the sidebar',
    icon: 'git-compare',
  },
  {
    scene: 'ticket',
    kind: 'Ticket',
    identifier: 'ME-1094 · Linear',
    state: 'Backlog',
    other: ['ME-1087 · Linear', 'koja #52 · GitHub'],
    tab: 'ME-1094 Design the ticket view',
    icon: 'file',
  },
];

const reviews = ['review', 'review-saving-failed', 'review-sent', 'review-narrow'];

afterAll(() => {
  mock.restore();
});

describe('Rail content scenes', () => {
  test.each(items)('$scene names each source once before its state and read age', (item) => {
    const pane = paneOf(item.scene, item.kind);
    const texts = drawnTexts(pane);

    for (const target of [item.identifier, ...item.other]) {
      expect(texts.filter((text) => text === target)).toHaveLength(1);
    }

    expect(texts.indexOf(item.identifier)).toBeLessThan(texts.indexOf(item.state));
    expect(texts.filter((text) => text === 'read 1m ago')).toHaveLength(1);
    expect(texts.indexOf(item.state)).toBeLessThan(texts.indexOf('read 1m ago'));
  });

  test.each(items)('$scene keeps its kind icon in the item tab', (item) => {
    const scene = contentScene(item.scene);

    const tab = descendants(scene).find((part) =>
      part.kids.some((child) => child.texts.includes(item.tab)),
    );

    expect(tab).toBeDefined();
    expect(drawnIcons(tab!)).toEqual([item.icon, 'x']);
  });

  test.each(reviews)('%s names the selected space ticket and its agent terminal', (scene) => {
    const pane = paneOf(scene, 'Draft review');
    const texts = drawnTexts(pane);
    const agent = sharedRegion(pane, 'Agent', 'Claude Code · Design the sidebar');

    expect(texts.filter((text) => text === 'ME-1090 · Linear')).toHaveLength(1);
    expect(texts).not.toContain('ME-1092');
    expect(texts).toContain('# Sidebar design');
    expect(drawnIcons(agent)).toContain('terminal');
    expect(texts.filter((text) => text === 'Claude Code · Design the sidebar')).toHaveLength(1);
  });

  test('the base review names the send action and saved state', () => {
    const scene = contentScene('review');
    const texts = drawnTexts(scene);

    expect(texts).toContain('Send to Tau');
    expect(texts).not.toContain('Done');
    expect(texts).toContain('in review');
    expect(texts).toContain('1m ago');
    expect(texts).not.toContain('saved 1m ago');
    expect(texts).not.toContain('> bun run check');
    expect(texts).toContain('Insert');
  });

  test('a failed save keeps edits and explains why sending is disabled without a solid fill', () => {
    const pane = paneOf('review-saving-failed', 'Draft review');
    const texts = drawnTexts(pane);
    const disabled = descendants(pane).filter((part) => part.isDisabled);
    const reason = 'Could not save: the review folder is read-only';
    const action = sharedRegion(pane, reason, 'Send to Tau');

    expect(texts).toContain('Keep the selected space visible when groups fold.');
    expect(texts).toContain('Unsaved');
    expect(texts).toContain('L6');
    expect(texts).toContain('L12–14');
    expect(texts.filter((text) => text === reason)).toHaveLength(1);
    expect(texts).toContain('Your edits stay in this pane. Send waits for a save.');
    expect(texts).not.toContain('Saved');
    expect(disabled).toHaveLength(1);
    expect(drawnTexts(disabled[0]!)).toContain('Send to Tau');
    expect(disabled[0]!.backgroundColors).toHaveLength(0);
    expect(disabled[0]!.clickHandlers).toHaveLength(0);
    expect(drawnTexts(action)).toContain('Retry');
    expect(drawnTexts(action)).not.toContain('# Sidebar design');

    expect(drawnTexts(contentScene('review'))).toContain(
      'The sidebar keeps each space and its work visible.',
    );
  });

  test('a sent review keeps read-only text and comments without a send action', () => {
    const texts = drawnTexts(paneOf('review-sent', 'Draft review'));

    expect(texts).toContain('Sent to Tau');
    expect(texts).not.toContain('Send to Tau');
    expect(texts).toContain('Tau closes this pane after collecting the review.');
    expect(texts.filter((text) => text === 'Read-only')).toHaveLength(3);
    expect(texts).toContain('L6');
    expect(texts).toContain('L12–14');
  });

  test.each(reviews)('%s shows the selected file comment count on its row', (scene) => {
    const pane = paneOf(scene, 'Draft review');

    const file = descendants(pane).findLast((part) => {
      const texts = drawnTexts(part);

      return texts.includes('design.md') && texts.includes('2') && !texts.includes('20 lines');
    });

    expect(file).toBeDefined();
    expect(drawnIcons(file!)).toContain('message-square');
    expect(drawnTexts(file!)).not.toContain('slice-1.md');
    expect(drawnTexts(file!)).not.toContain('20 lines');
  });

  test('the narrow review keeps files and send together before the text beside the terminal', () => {
    const scene = contentScene('review-narrow');
    const texts = drawnTexts(scene);
    const toolbar = sharedRegion(scene, 'Send to Tau', 'slice-2.md');

    expect(texts).toContain('> bun run check');
    expect(texts.indexOf('Send to Tau')).toBeGreaterThan(-1);
    expect(texts.indexOf('Send to Tau')).toBeLessThan(texts.indexOf('# Sidebar design'));
    expect(drawnTexts(toolbar)).not.toContain('# Sidebar design');
  });

  test.each(['pr', 'pr-checks-failed', 'pr-normal'])(
    '%s keeps checks values and marks instead of replacing them with an age',
    (scene) => {
      const pane = paneOf(scene, 'Pull request');
      const fact = sharedRegion(pane, 'Checks', '1 failing · 2 running');
      const checks = sharedRegion(pane, 'typecheck', 'style');

      expect(drawnIcons(fact)).toContain('circle-x');
      expect(drawnIcons(checks)).toContain('circle-x');
      expect(drawnIcons(checks).filter((name) => name === 'loader-circle')).toHaveLength(2);
      expect(spinning(checks)).toBe(false);
    },
  );

  test('failed checks show item freshness and part freshness with a local Retry', () => {
    const pane = paneOf('pr-checks-failed', 'Pull request');
    const texts = drawnTexts(pane);
    const reason = 'Could not refresh checks · showing checks from 6m ago';
    const checks = sharedRegion(pane, reason, 'typecheck');
    const fact = sharedRegion(pane, 'Checks', '1 failing · 2 running');

    expect(texts.filter((text) => text === 'read 1m ago')).toHaveLength(1);
    expect(drawnTexts(fact)).toContain('· 6m old');
    expect(drawnTexts(checks)).toContain('Retry');
    expect(drawnTexts(checks)).not.toContain('Threads 2');
    expect(texts).toContain('Type mismatch in rows.ts:48');
  });

  test.each(['failing', 'running', 'passed'])(
    '%s checks have their own still status mark',
    (state) => {
      const marks: Record<string, string> = {
        failing: 'circle-x',
        running: 'loader-circle',
        passed: 'check',
      };

      const mark = checkMark(state, koja);

      expect(drawnIcons(mark)).toEqual([marks[state]!]);
      expect(spinning(mark)).toBe(false);
    },
  );

  test('PR files start collapsed with their change totals intact', () => {
    const pane = paneOf('pr', 'Pull request');
    const files = sharedRegion(pane, 'Files 9', '+412');

    expect(drawnIcons(files)).toContain('chevron-right');
    expect(drawnTexts(files)).toContain('−38');
    expect(drawnTexts(pane)).not.toContain('src/mods/koja-spaces/main.ts');
  });

  test('fact labels are dim while their values use text ink', () => {
    const pane = paneOf('ticket', 'Ticket');

    expect(elementWithText(pane, 'Project')?.textColors).toEqual([koja.ink.dim]);
    expect(elementWithText(pane, 'Koja')?.textColors).toEqual([koja.ink.text]);
  });

  test('threads identify author and age and slices have no numeric prefix', () => {
    const pull = drawnTexts(paneOf('pr', 'Pull request'));
    const ticket = drawnTexts(paneOf('ticket', 'Ticket'));

    expect(pull).toContain('rows.ts · L48 · sqve · 2h ago');
    expect(pull).toContain('repoLabel.ts · L27–31 · sqve · 1h ago');
    expect(ticket).toContain('Read the ticket snapshot');
    expect(ticket).toContain('Draw the shared content frame');
    expect(ticket).toContain('Check links and empty states');
    expect(ticket.some((text) => /^\d\. /.test(text))).toBe(false);
  });

  test('an unreachable PR shows its named source but no invented read time', () => {
    const texts = drawnTexts(paneOf('pr-unreachable', 'Pull request'));

    expect(texts).toContain('koja #41 · GitHub');
    expect(texts).toContain('Could not read PR · GitHub is unreachable');
    expect(texts.filter((text) => text === 'Retry')).toHaveLength(1);
    expect(texts).not.toContain('Design the sidebar');
    expect(texts).not.toContain('read 1m ago');
    expect(texts).not.toContain('Checks 3');
  });

  test('a first ticket read names its source without inventing facts or a read time', () => {
    const texts = drawnTexts(paneOf('ticket-loading', 'Ticket'));

    expect(texts).toContain('ME-1094 · Linear');
    expect(texts).toContain('Loading ticket');
    expect(texts).not.toContain('Backlog');
    expect(texts).not.toContain('Project');
    expect(texts).not.toContain('read 1m ago');
  });

  test('long linked facts keep their full source in a tooltip', () => {
    const pane = paneOf('ticket-long', 'Ticket');
    const texts = drawnTexts(pane);
    const parent = texts.find((text) => text.startsWith('ME-1087 ·'));

    expect(parent).toBeDefined();
    expect(drawnTooltips(pane)).toContain(parent!);
    expect(parent).toEndWith('· Linear');

    for (const target of ['koja #52 · GitHub', 'koja #57 · GitHub', 'koja #63 · GitHub']) {
      expect(texts.filter((text) => text === target)).toHaveLength(1);
    }
  });

  test('normal mode keeps the focused content tint and indigo border', () => {
    const scene = contentScene('pr-normal');
    const pane = paneOf('pr-normal', 'Pull request');

    expect(drawnTexts(scene)).toContain('Normal');
    expect(drawnTexts(scene)).not.toContain('Insert');
    expect(pane.borderColors).toContain(kojaNormal.pane.focusedBorder);

    expect(descendants(pane).flatMap((part) => part.backgroundColors)).toContain(
      kojaNormal.pane.focusedHeaderFill,
    );
  });
});
