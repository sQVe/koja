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
  koja: {
    ink: { text: string; dim: string; muted: string };
    marks: { working: string; blocked: string; added: string; removed: string };
  };
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
    body: '# Sidebar design',
  },
  {
    scene: 'pr',
    kind: 'Pull request',
    identifier: 'koja #41 · GitHub',
    state: 'open',
    other: ['ME-1090 · Linear'],
    tab: '#41 Design the sidebar',
    icon: 'git-compare',
    body: 'typecheck',
  },
  {
    scene: 'ticket',
    kind: 'Ticket',
    identifier: 'ME-1094 · Linear',
    state: 'Backlog',
    other: ['ME-1087 · Linear', 'koja #52 · GitHub'],
    tab: 'ME-1094 Design the ticket view',
    icon: 'file',
    body: 'Description',
  },
];

const reviews = ['review', 'review-saving-failed', 'review-sent', 'review-narrow'];

afterAll(() => {
  mock.restore();
});

describe('Rail content scenes', () => {
  test.each(items)('$scene names each source once before its state and content', (item) => {
    const pane = paneOf(item.scene, item.kind);
    const texts = drawnTexts(pane);

    for (const target of [item.identifier, ...item.other]) {
      expect(texts.filter((text) => text === target)).toHaveLength(1);
    }

    expect(texts.indexOf(item.identifier)).toBeLessThan(texts.indexOf(item.state));
    expect(texts.indexOf(item.state)).toBeLessThan(texts.indexOf(item.body));
    expect(texts).not.toContain('read 1m ago');

    if (item.scene !== 'review') {
      expect(texts.filter((text) => text === 'synced 1m ago')).toHaveLength(1);
      expect(texts.indexOf(item.state)).toBeLessThan(texts.indexOf('synced 1m ago'));
    }

    for (const action of [
      'Open ticket',
      'Open on GitHub',
      'Open in Linear',
      '#52 · Ticket view frame',
    ]) {
      expect(texts).not.toContain(action);
    }
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
    const agent = sharedRegion(pane, 'Agent', 'Design the sidebar');

    expect(texts.filter((text) => text === 'ME-1090 · Linear')).toHaveLength(1);
    expect(texts).not.toContain('ME-1092');
    expect(texts).toContain('# Sidebar design');
    expect(drawnIcons(agent)).toContain('terminal');
    expect(texts.filter((text) => text === 'Design the sidebar')).toHaveLength(1);
    expect(drawnTooltips(agent)).toContain('Design the sidebar');
    expect(texts).toContain('Tau');
    expect(texts).not.toContain('Tau · draft review');
    expect(texts).not.toContain('synced 1m ago');
    expect(texts).not.toContain('read 1m ago');
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
    expect(texts).not.toContain('Normal');

    for (const content of [
      'slice-1.md',
      'slice-2.md',
      'L6',
      'L12–14',
      'Keep the selected space visible when the project folds.',
      'Keep work-need marks visible when the group is folded.',
    ]) {
      expect(texts).toContain(content);
    }
  });

  test('a failed save keeps edits and explains why sending is disabled without a solid fill', () => {
    const pane = paneOf('review-saving-failed', 'Draft review');
    const texts = drawnTexts(pane);
    const disabled = descendants(pane).filter((part) => part.isDisabled);
    const reason = 'Could not save: ~/code/koja/.tau/reviews is read-only';
    const action = sharedRegion(pane, reason, 'Send to Tau');

    expect(texts).toContain('Keep the selected space visible when groups fold.');
    expect(texts.filter((text) => text === 'Unsaved')).toHaveLength(3);
    expect(elementWithText(pane, 'unsaved')?.textColors).toEqual([koja.marks.working]);
    expect(texts.indexOf('unsaved')).toBeLessThan(texts.indexOf('# Sidebar design'));
    expect(texts).toContain('L6');
    expect(texts).toContain('L12–14');
    expect(texts.filter((text) => text === reason)).toHaveLength(1);

    expect(texts).toContain(
      '1 line and 2 comments are unsaved. They stay in this pane, and Send waits for a save.',
    );

    expect(texts).not.toContain('Saved');
    expect(disabled).toHaveLength(1);
    expect(drawnTexts(disabled[0]!)).toContain('Send to Tau');
    expect(disabled[0]!.backgroundColors).toHaveLength(0);
    expect(disabled[0]!.borderColors).toHaveLength(0);
    expect(elementWithText(disabled[0]!, 'Send to Tau')?.textColors).toEqual([koja.ink.dim]);
    expect(disabled[0]!.clickHandlers).toHaveLength(0);
    expect(drawnTexts(action)).toContain('Retry');
    expect(drawnTexts(action)).toContain('Copy path');

    for (const range of ['L6', 'L12–14']) {
      const comment = descendants(pane).findLast((part) => {
        const commentTexts = drawnTexts(part);

        const hasGutter = part.kids.some((child) =>
          child.backgroundColors.includes(koja.marks.working),
        );

        return commentTexts.includes(range) && commentTexts.includes('Unsaved') && hasGutter;
      });

      expect(comment).toBeDefined();
      expect(drawnTexts(comment!)).not.toContain('# Sidebar design');
    }

    expect(drawnTexts(action)).not.toContain('# Sidebar design');

    expect(drawnTexts(contentScene('review'))).toContain(
      'The sidebar keeps each space and its work visible.',
    );
  });

  test('a sent review keeps read-only text and comments without a send action', () => {
    const texts = drawnTexts(paneOf('review-sent', 'Draft review'));

    expect(texts).toContain('Sent to Tau');
    expect(texts).not.toContain('Send to Tau');
    expect(texts).not.toContain('Done');
    expect(texts).not.toContain('Unsaved');
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

    expect(texts.filter((text) => text === 'synced 1m ago')).toHaveLength(1);
    expect(drawnTexts(fact)).toContain('· 6m old');
    expect(drawnTexts(checks)).toContain('Retry');
    expect(drawnTexts(checks)).not.toContain('Threads');

    expect(texts).toContain('tests');
    expect(drawnTexts(sharedRegion(pane, 'Threads', '2'))).toEqual(['Threads', '2']);
    expect(drawnTexts(sharedRegion(pane, 'Files', '9'))).toEqual(['Files', '9']);
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

    const files = descendants(pane).findLast((part) => {
      const texts = drawnTexts(part);

      return texts.includes('Files') && texts.includes('9') && texts.includes('+412');
    })!;

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

    expect(pull).toContain('rows.ts:48');
    expect(pull).toContain('repoLabel.ts:27–31');
    expect(pull).toContain('sqve · 2h ago');
    expect(pull).toContain('sqve · 1h ago');
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
    expect(texts).not.toContain('synced 1m ago');
    expect(texts).not.toContain('Checks');
    expect(texts).not.toContain('open');
    expect(texts).not.toContain('Description');
  });

  test('a first ticket read names its source without inventing facts or a read time', () => {
    const texts = drawnTexts(paneOf('ticket-loading', 'Ticket'));

    expect(texts).toContain('ME-1094 · Linear');
    expect(texts).toContain('Loading ticket');
    expect(texts).not.toContain('Backlog');
    expect(texts).not.toContain('Project');
    expect(texts).not.toContain('Design the ticket view');
    expect(texts).not.toContain('Slices');
    expect(texts).not.toContain('Retry');
    expect(texts).not.toContain('read 1m ago');
    expect(texts).not.toContain('synced 1m ago');
  });

  test('long linked facts keep their full source in a tooltip', () => {
    const pane = paneOf('ticket-long', 'Ticket');
    const texts = drawnTexts(pane);
    const parent = texts.find((text) => text.startsWith('ME-1087 ·'));

    expect(parent).toBeDefined();
    expect(drawnTooltips(pane)).toContain(parent!);
    expect(parent).toEndWith('· Linear');
    expect(parent).toContain('every active development session in one window');

    expect(texts).toContain(
      'Design the ticket view for long titles, related pull requests, and project context across several active development cycles',
    );

    for (const fact of ['Labels', 'Assignee', 'Cycle', 'Estimate', 'Slices']) {
      expect(texts).toContain(fact);
    }

    for (const target of ['koja #52 · GitHub', 'koja #57 · GitHub', 'koja #63 · GitHub']) {
      expect(texts.filter((text) => text === target)).toHaveLength(1);
    }
  });

  test.each(['pr', 'pr-checks-failed', 'pr-normal'])(
    '%s puts attention first and gives check ages from now',
    (scene) => {
      const pane = paneOf(scene, 'Pull request');
      const texts = drawnTexts(pane);

      const sections = descendants(pane).filter((part) =>
        part.kids.some((child) => child.kids.some((mark) => mark.path === 'chevron-down')),
      );

      const headings = sections.map((part) => drawnTexts(part)[0]);

      expect(headings).toEqual(['Checks', 'Threads', 'Description']);
      expect(texts.indexOf('Description')).toBeLessThan(texts.lastIndexOf('Files'));
      expect(texts.some((text) => text.includes('before last read'))).toBe(false);
      const age = scene === 'pr-checks-failed' ? 'started 8m ago' : 'started 2m ago';

      expect(texts).toContain(age);

      if (scene === 'pr-checks-failed') {
        const running = descendants(pane).filter((part) => part.texts.includes('running'));

        expect(running).toHaveLength(2);
        expect(running.map((part) => part.textColors)).toEqual([[koja.ink.dim], [koja.ink.dim]]);
      }
    },
  );

  test.each(['pr', 'pr-checks-failed', 'pr-normal'])(
    '%s colors diff totals in the facts and Files section',
    (scene) => {
      const pane = paneOf(scene, 'Pull request');

      for (const [text, color] of [
        ['+412', koja.marks.added],
        ['−38', koja.marks.removed],
      ] as const) {
        const counts = descendants(pane).filter((part) => part.texts.includes(text));

        expect(counts).toHaveLength(2);
        expect(counts.map((part) => part.textColors)).toEqual([[color], [color]]);
      }
    },
  );

  test.each(['review', 'review-saving-failed', 'review-narrow'])(
    '%s marks the review as waiting for the user',
    (scene) => {
      const pane = paneOf(scene, 'Draft review');

      const chip = descendants(pane).findLast(
        (part) => drawnTexts(part).includes('in review') && drawnIcons(part).length > 0,
      )!;

      expect(drawnIcons(chip)).toEqual(['message-circle-question']);
      expect(descendants(chip).flatMap((part) => part.textColors)).toContain(koja.marks.blocked);
    },
  );

  test.each(reviews)('%s distinguishes commented line numbers from plain line numbers', (scene) => {
    const pane = paneOf(scene, 'Draft review');

    for (const number of ['6', '12', '13', '14']) {
      expect(elementWithText(pane, number)?.textColors).toEqual([koja.ink.text]);
    }

    expect(elementWithText(pane, '5')?.textColors).toEqual([koja.ink.dim]);
  });

  test.each(['ticket', 'ticket-long'])(
    '%s keeps slice counts in the section and shows related PR states before links',
    (scene) => {
      const pane = paneOf(scene, 'Ticket');
      const texts = drawnTexts(pane);
      const related = sharedRegion(pane, 'open', 'koja #52 · GitHub');

      expect(texts.filter((text) => text === 'Slices')).toHaveLength(1);
      expect(texts).not.toContain('1 done · 1 in progress · 1 backlog');

      expect(drawnTexts(related).indexOf('open')).toBeLessThan(
        drawnTexts(related).indexOf('koja #52 · GitHub'),
      );

      expect(elementWithText(related, 'open')?.textColors).toEqual([koja.ink.dim]);
    },
  );

  test.each(['pr', 'ticket', 'review'])(
    '%s dims section counts separately from titles',
    (scene) => {
      const kind = items.find((item) => item.scene === scene)!.kind;
      const pane = paneOf(scene, kind);
      const sections: Record<string, string> = { pr: 'Checks', ticket: 'Slices', review: 'Files' };
      const section = sections[scene]!;
      const header = sharedRegion(pane, section, '3');

      expect(elementWithText(header, '3')?.textColors).toEqual([koja.ink.dim]);
      expect(elementWithText(header, section)?.textColors).toEqual([koja.ink.text]);
    },
  );

  test('normal mode keeps the focused content tint and indigo border', () => {
    const scene = contentScene('pr-normal');
    const pane = paneOf('pr-normal', 'Pull request');

    expect(drawnTexts(scene)).toContain('Normal');
    expect(drawnTexts(scene)).toContain('> bun run check');
    expect(drawnTexts(scene)).not.toContain('Insert');
    expect(pane.borderColors).toContain(kojaNormal.pane.focusedBorder);

    expect(descendants(pane).flatMap((part) => part.backgroundColors)).toContain(
      kojaNormal.pane.focusedHeaderFill,
    );
  });
});
