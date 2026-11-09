import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../../../../tests/drawn.ts';
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
  spaceStates: Record<string, SpaceStateShape> & { busy: SpaceStateShape };
};

const { koja } = (await import(kojaPath)) as { koja: unknown };

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
    expect(textAfter(texts, '5')).toBe('· 1 done');
  });

  test('a panel with room keeps its done workers and says nothing more in the header', () => {
    const texts = textsOf('stack', 'base');

    expect(texts).toContain('Judge direction-koja');
    expect(texts.some((text) => text.endsWith('done'))).toBe(false);
  });

  test('the reply field names the worker it answers', () => {
    expect(textsOf('stack', 'busy')).toContain('Reply to Pick the ring size');
  });

  test('a panel short past its done workers keeps every running worker and the open question', () => {
    const busy = spaceStates.busy;
    const extra = [doneWorker('Audit the icons'), runningWorker('Port the files view')];
    const state = { ...busy, workers: [...busy.workers, ...extra, runningWorker('Trim the kit')] };
    const texts = drawnTexts(spaceScene('stack', state, koja));

    expect(texts).toContain('· 2 done');
    expect(texts).not.toContain('Audit the icons');
    expect(texts).toContain('Port the files view');
    expect(texts).toContain('Trim the kit');
    expect(texts).toContain('Reply to Pick the ring size');
    expect(texts).toContain('main');
    expect(texts).toContain('#38');
  });

  test('the stack header names the PR that owns its top need', () => {
    expect(textsOf('stack', 'busy')).toContain('#40 failing');
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

  test('without a switch a Changes header titles the changes with their count', () => {
    expect(textAfter(textsOf('stack', 'main'), 'Changes')).toBe('2');
  });

  test('an unselected waiting worker ends its question line with its time left', () => {
    const texts = textsOf('stack', 'busy');

    expect(textAfter(texts, 'Should the judge score the normal mode crops too?')).toBe('17m left');
  });

  test('a clean space hides the workers section', () => {
    expect(textsOf('stack', 'clean')).not.toContain('Workers');
  });

  test('the files view swaps the stack for the tree and keeps the workers', () => {
    const texts = textsOf('files', 'base');

    expect(texts).toContain('package.json');
    expect(texts).not.toContain('Find a space by PR');
    expect(texts).toContain('Port the shell scene');
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

  test('an asking worker waits, and its time left joins the question age', () => {
    const texts = textsOf('stack', 'base');

    expect(texts).toContain('waiting');
    expect(texts).toContain('2m ago · 22m left');
    expect(texts).not.toContain('22m left');
    expect(texts).toContain('41m left');
    expect(texts).toContain('report ready');
  });
});
