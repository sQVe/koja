import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts } from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';

interface SpaceStateShape {
  workers: Record<string, unknown>[];
}

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake());

await mock.module('../../../../kit/index.ts', () =>
  kitIndexFake({ icon: (name: string) => drawn(name) }),
);

// Loaded by path, so the root typecheck does not follow them into source that needs Herdr's types.
const spacePath = './space.ts';
const spaceDataPath = './spaceData.ts';
const kojaPath = '../koja.ts';

const { spaceScene } = (await import(spacePath)) as {
  spaceScene: (view: string, state: unknown, tokens: unknown) => DrawnElement;
};

const { spaceStates } = (await import(spaceDataPath)) as {
  spaceStates: Record<string, SpaceStateShape> & {
    busy: SpaceStateShape;
    base: SpaceStateShape;
  };
};

const { koja } = (await import(kojaPath)) as { koja: { ink: { text: string } } };

afterAll(() => {
  mock.restore();
});

const textsOf = (view: string, state: string): string[] =>
  drawnTexts(spaceScene(view, spaceStates[state], koja));

const doneWorker = (task: string): Record<string, unknown> => ({
  task,
  profile: 'scout',
  status: 'done',
  left: 'report ready',
  selected: false,
});

const runningWorker = (task: string): Record<string, unknown> => ({
  task,
  profile: 'worker',
  status: 'working',
  left: '30m left',
  selected: false,
});

const partsOf = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(partsOf),
];

const textAfter = (texts: string[], text: string): string | undefined =>
  texts[texts.indexOf(text) + 1];

describe('the space panel', () => {
  test.each(Object.keys(spaceStates))('%s is named Space and has no commit bar', (state) => {
    const texts = textsOf('stack', state);

    expect(texts).toContain('Space');
    expect(texts).not.toContain('Commit');
  });

  test('the busy space draws every running and waiting worker and the open question', () => {
    const texts = textsOf('stack', 'busy');

    for (const task of ['Judge direction-koja', 'Pick the ring size', 'Port the shell scene']) {
      expect(texts).toContain(task);
    }

    expect(texts).toContain('Mock scenes');
    expect(texts.filter((text) => text.startsWith('Reply to'))).toHaveLength(1);
  });

  test('the busy space keeps two file names before folding the rest', () => {
    const texts = textsOf('stack', 'busy');

    expect(texts).toContain('docs/adr/0014-side-panel-structure.md');
    expect(texts).toContain('src/kit/button.ts');
    expect(texts).toContain('46 more files');
  });

  test('a short panel leaves out done workers and counts them in the Workers header', () => {
    const texts = textsOf('stack', 'busy');

    expect(texts).not.toContain('Restack onto main');
    expect(textAfter(texts.slice(texts.indexOf('Workers')), '·')).toBe('1 done');
  });

  test('the done count in the Workers header carries a chevron that lists them', () => {
    const chevrons = (state: string): number =>
      drawnIcons(spaceScene('stack', spaceStates[state], koja)).filter(
        (name) => name === 'chevron-down',
      ).length;

    expect(chevrons('busy') - chevrons('base')).toBe(1);
  });

  test('a panel with room keeps its done workers and says nothing more in the header', () => {
    const texts = textsOf('stack', 'base');

    expect(texts).toContain('Judge direction-koja');
    expect(texts.some((text) => /\d+ done$/.test(text))).toBe(false);
  });

  test('the reply field names the worker it answers', () => {
    expect(textsOf('stack', 'busy')).toContain('Reply to Pick the ring size');
  });

  test('a panel short past its done workers keeps every running worker and the open question', () => {
    const busy = spaceStates.busy;
    const extra = [doneWorker('Audit the icons'), runningWorker('Port the files view')];
    const state = { ...busy, workers: [...busy.workers, ...extra, runningWorker('Trim the kit')] };
    const texts = drawnTexts(spaceScene('stack', state, koja));

    expect(texts).toContain('2 done');
    expect(texts).not.toContain('Audit the icons');
    expect(texts).toContain('Port the files view');
    expect(texts).toContain('Trim the kit');
    expect(texts).toContain('Reply to Pick the ring size');
    expect(texts).toContain('main');
    expect(texts).toContain('#38');
  });

  test('the stack header names the PR of every need, worst first', () => {
    const busy = textsOf('stack', 'busy');
    const busyNeeds = busy.slice(busy.indexOf('#40 failing'), busy.indexOf('#40 failing') + 5);

    expect(busyNeeds).toEqual(['#40 failing', '·', '#38', '·', '#43']);

    const base = textsOf('stack', 'base');
    const baseNeeds = base.slice(base.indexOf('#40 failing'), base.indexOf('#40 failing') + 4);

    expect(baseNeeds).toEqual(['#40 failing', '·', '#38', '#44']);
  });

  test('a read error names the age of the stack once, in its banner', () => {
    const texts = textsOf('stack', 'error');

    expect(texts).toContain('Could not read PRs · showing 4m ago');
    expect(texts).toContain('Retry');
    expect(texts.some((text) => text.startsWith('as of'))).toBe(false);
  });

  test('the checked-out PR marks its running checks', () => {
    const scene = spaceScene('stack', spaceStates.base, koja);

    const holders = partsOf(scene).filter(
      (part) =>
        drawnTexts(part).includes('2 checks running') && drawnIcons(part).includes('loader-circle'),
    );

    expect(holders.some((part) => drawnTexts(part).length === 1)).toBe(true);
  });

  test('the checked-out PR draws its ticket as a link, in text ink', () => {
    const scene = spaceScene('stack', spaceStates.base, koja);
    const tickets = partsOf(scene).filter((part) => part.texts.includes('ME-1090'));

    expect(tickets.at(-1)?.textColors).toEqual([koja.ink.text]);
  });

  test('the checked-out PR says so at its row end', () => {
    const texts = textsOf('stack', 'base');

    expect(texts.filter((text) => text === 'checked out')).toHaveLength(1);
  });

  test('the switch titles the changes of a branch with a base', () => {
    const texts = textsOf('stack', 'base');

    expect(texts).not.toContain('Changes');
    expect(textAfter(texts, 'Uncommitted 3')).toBe('Branch 9');
  });

  test('on main the stack says there is no pull request and the switch titles the changes', () => {
    const all = textsOf('stack', 'main');
    const texts = all.slice(all.indexOf('Stack'));

    expect(textAfter(texts, 'main')).toBe('no pull request');
    expect(textAfter(texts, 'no pull request')).toBe('Uncommitted 2');
    expect(textAfter(texts, 'Uncommitted 2')).toBe('Branch 0');
    expect(texts).not.toContain('Changes');
  });

  test('the manager line shows its state word', () => {
    const managerState = (texts: string[]): string | undefined =>
      textAfter(texts.slice(texts.indexOf('Workers')), 'Claude Code');

    expect(managerState(textsOf('stack', 'base'))).toBe('working');

    const idle = { ...spaceStates.base, workers: [doneWorker('Audit the icons')] };

    expect(managerState(drawnTexts(spaceScene('stack', idle, koja)))).toBe('idle');
  });

  test('the left-out done count follows the worker count after a dot', () => {
    const texts = textsOf('stack', 'busy');
    const workers = texts.slice(texts.indexOf('Workers'));

    expect(workers.slice(1, 4)).toEqual(['5', '·', '1 done']);
  });

  test('an unselected question line holds only the question', () => {
    const texts = textsOf('stack', 'busy');

    expect(textAfter(texts, 'Should the judge score the normal mode crops too?')).toBe(
      'Pick the ring size',
    );
  });

  test('a clean space hides the workers section', () => {
    expect(textsOf('stack', 'clean')).not.toContain('Workers');
  });

  test('the files view swaps the stack for the tree and keeps the workers', () => {
    const texts = textsOf('files', 'base');

    expect(texts).toContain('AGENTS.md');
    expect(texts).not.toContain('Find a space by PR');
    expect(texts).toContain('Port the shell scene');
  });

  test('the files view ends the tree on a whole row and counts the rest', () => {
    const texts = textsOf('files', 'base');

    expect(texts).not.toContain('package.json');
    expect(textAfter(texts, 'AGENTS.md')).toBe('2 more entries');
  });

  test('the Files header does not repeat the repository name', () => {
    expect(textAfter(textsOf('files', 'base'), 'Files')).toBe('config');
  });

  test.each(Object.keys(spaceStates))('%s names the repository beside Space', (state) => {
    const texts = textsOf('stack', state);

    const title = texts.indexOf('Space');

    expect(texts[title + 1]).toBe('koja');
  });

  test('the busy space keeps every PR row and main', () => {
    const texts = textsOf('stack', 'busy');

    for (const pull of ['#48', '#47', '#44', '#43', '#41', '#40', '#38']) {
      expect(texts).toContain(pull);
    }

    expect(texts).toContain('main');
  });

  test('each worker row ends with its budget and its state word', () => {
    const texts = textsOf('stack', 'base');

    expect(textAfter(texts, '22m budget')).toBe('waiting');
    expect(textAfter(texts, '41m budget')).toBe('running');
    expect(textAfter(texts, 'scout')).toBe('done');
    expect(texts).not.toContain('report ready');
    expect(texts.some((text) => text.endsWith('left'))).toBe(false);
  });

  test('the open question says when it was asked', () => {
    expect(textsOf('stack', 'base')).toContain('asked 2m ago');
  });
});
