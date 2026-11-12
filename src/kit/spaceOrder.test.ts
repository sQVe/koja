import { describe, expect, test } from 'bun:test';

import type { SpaceCommand, SpaceOrder, SpaceStepFacts } from './spaceOrder.ts';
import {
  clearSpaceOrder,
  readSpaceOrder,
  rootStepCommand,
  spaceStepCommand,
  visibleSpaceIds,
  writeSpaceOrder,
} from './spaceOrder.ts';

const memoryStore = () => {
  const values: Record<string, unknown> = {};

  return {
    get: (key: string): unknown => values[key],
    set: (key: string, value: unknown): void => {
      values[key] = value;
    },
  };
};

describe('space order', () => {
  test('reads back the shown and hidden ids that were written', () => {
    const store = memoryStore();

    const published = { shown: ['main', 'worktree'], hidden: ['folded'], roots: ['main'] };

    writeSpaceOrder(store.set, published);

    expect(readSpaceOrder(store.get)).toEqual(published);
  });

  test('reads no order after the published order is cleared', () => {
    const store = memoryStore();

    writeSpaceOrder(store.set, { shown: ['main'], hidden: [], roots: [] });
    clearSpaceOrder(store.set);

    expect(readSpaceOrder(store.get)).toBeNull();
  });

  test('reads no order when nothing was published', () => {
    expect(readSpaceOrder(memoryStore().get)).toBeNull();
  });

  test('reads no order when the value is not an object', () => {
    expect(readSpaceOrder(() => 'main')).toBeNull();
  });

  test('reads no order when the hidden list is missing', () => {
    expect(readSpaceOrder(() => ({ shown: ['main'], roots: [] }))).toBeNull();
  });

  test('reads no order when the root list is missing', () => {
    expect(readSpaceOrder(() => ({ shown: ['main'], hidden: [] }))).toBeNull();
  });

  test('reads no order when a list holds something other than ids', () => {
    expect(readSpaceOrder(() => ({ shown: ['main', 3], hidden: [], roots: [] }))).toBeNull();
  });
});

const order = (shown: string[], hidden: string[] = [], roots: string[] = []): SpaceOrder => ({
  shown,
  hidden,
  roots,
});

const select = (id: string): SpaceCommand => ({ name: 'space.select', args: { id } });

const nextFallback: SpaceCommand = { name: 'space.next' };

const previousFallback: SpaceCommand = { name: 'space.prev' };

const sidebar = ['main', 'worktree', 'notes'];

const facts = (
  current: string | null,
  published: SpaceOrder | null,
  liveIds: string[] = sidebar,
): SpaceStepFacts => ({ current, order: published, liveIds });

const steps: [string, number, SpaceStepFacts, SpaceCommand | null][] = [
  [
    'selects the next sidebar row, not the next in Herdr order',
    1,
    facts('main', order(sidebar)),
    select('worktree'),
  ],
  ['selects the row above in the sidebar', -1, facts('worktree', order(sidebar)), select('main')],
  ['wraps from the last row to the first', 1, facts('notes', order(sidebar)), select('main')],
  ['wraps from the first row to the last', -1, facts('main', order(sidebar)), select('notes')],
  ['falls back to space.next with no published order', 1, facts('main', null), nextFallback],
  ['falls back to space.prev with no published order', -1, facts('main', null), previousFallback],
  [
    'falls back when the focused space is in neither list',
    1,
    facts('other', order(sidebar)),
    nextFallback,
  ],
  ['falls back when no space is focused', 1, facts(null, order(['main']), ['main']), nextFallback],
  [
    'falls back forward when a live space is unlisted',
    1,
    facts('main', order(['main', 'notes']), ['main', 'notes', 'added']),
    nextFallback,
  ],
  [
    'falls back backward when a live space is unlisted',
    -1,
    facts('main', order(['main', 'notes']), ['main', 'notes', 'added']),
    previousFallback,
  ],
  [
    'skips a folded space listed as hidden',
    1,
    facts('main', order(['main', 'notes'], ['worktree'])),
    select('notes'),
  ],
  [
    'goes from a hidden space to the first shown space',
    1,
    facts('remote-a', order(['local', 'notes'], ['remote-a', 'remote-b']), [
      'local',
      'notes',
      'remote-a',
      'remote-b',
    ]),
    select('local'),
  ],
  [
    'goes back from a hidden space to the last shown space',
    -1,
    facts('remote-a', order(['local', 'work', 'notes'], ['remote-a', 'remote-b']), [
      'local',
      'work',
      'notes',
      'remote-a',
      'remote-b',
    ]),
    select('notes'),
  ],
  [
    'skips a space removed after the order was published',
    1,
    facts('main', order(['main', 'removed', 'notes']), ['main', 'notes']),
    select('notes'),
  ],
  [
    'skips a removed space going back',
    -1,
    facts('notes', order(['main', 'removed', 'notes']), ['main', 'notes']),
    select('main'),
  ],
  ['runs nothing for a single space', 1, facts('main', order(['main']), ['main']), null],
];

describe('spaceStepCommand', () => {
  test.each(steps)('%s', (_name, step, given, expected) => {
    expect(spaceStepCommand(step, given)).toEqual(expected);
  });
});

describe('visibleSpaceIds', () => {
  test('returns the shown spaces in sidebar order without the hidden ones', () => {
    const published = order(['notes', 'main'], ['worktree']);

    expect(visibleSpaceIds({ order: published, liveIds: sidebar })).toEqual(['notes', 'main']);
  });

  test('drops a shown space that is no longer live', () => {
    const published = order(['notes', 'removed', 'main']);

    expect(visibleSpaceIds({ order: published, liveIds: ['main', 'notes'] })).toEqual([
      'notes',
      'main',
    ]);
  });

  test('returns every live space in Herdr order when no order is published', () => {
    expect(visibleSpaceIds({ order: null, liveIds: sidebar })).toEqual(sidebar);
  });

  test('returns every live space when the order misses a live space', () => {
    const published = order(['notes'], ['main']);

    expect(visibleSpaceIds({ order: published, liveIds: sidebar })).toEqual(sidebar);
  });
});

const tree = ['a', 'a1', 'b', 'c'];

const treeOrder = order(tree, [], ['a', 'c']);

const foldedOrder = order(['a', 'b', 'c'], ['a1'], ['a', 'c']);

const foldedIds = ['a', 'b', 'c', 'a1'];

const rootSteps: [string, number, SpaceStepFacts, SpaceCommand | null][] = [
  ['selects the nearest root after a worktree', 1, facts('a1', treeOrder, tree), select('c')],
  ['selects the nearest root before a worktree', -1, facts('a1', treeOrder, tree), select('a')],
  ['selects the nearest root before a plain space', -1, facts('b', treeOrder, tree), select('a')],
  ['selects the next root from a root', 1, facts('a', treeOrder, tree), select('c')],
  ['wraps from the last root to the first', 1, facts('c', treeOrder, tree), select('a')],
  ['wraps from the first root to the last', -1, facts('a', treeOrder, tree), select('c')],
  [
    'goes from a hidden space to the first root',
    1,
    facts('a1', foldedOrder, foldedIds),
    select('a'),
  ],
  [
    'goes back from a hidden space to the last root',
    -1,
    facts('a1', foldedOrder, foldedIds),
    select('c'),
  ],
  [
    'skips a root that is not live',
    1,
    facts('a', order(['a', 'gone', 'c'], [], ['a', 'gone', 'c']), ['a', 'c']),
    select('c'),
  ],
  [
    'skips a root that is not live going back',
    -1,
    facts('c', order(['a', 'gone', 'c'], [], ['a', 'gone', 'c']), ['a', 'c']),
    select('a'),
  ],
  ['runs nothing with no published order', 1, facts('a', null, tree), null],
  ['runs nothing with no root', 1, facts('a', order(tree), tree), null],
  ['runs nothing when no space is focused', 1, facts(null, treeOrder, tree), null],
  ['runs nothing when the focused space is in neither list', 1, facts('x', treeOrder, tree), null],
  [
    'runs nothing when a live space is unlisted',
    1,
    facts('a1', treeOrder, [...tree, 'added']),
    null,
  ],
  [
    'runs nothing when the only root is the current space',
    1,
    facts('a', order(['a', 'a1'], [], ['a']), ['a', 'a1']),
    null,
  ],
  [
    'runs nothing going back when the only root is the current space',
    -1,
    facts('a', order(['a', 'a1'], [], ['a']), ['a', 'a1']),
    null,
  ],
];

describe('rootStepCommand', () => {
  test.each(rootSteps)('%s', (_name, step, given, expected) => {
    expect(rootStepCommand(step, given)).toEqual(expected);
  });
});
