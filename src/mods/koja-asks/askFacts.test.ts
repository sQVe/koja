import { describe, expect, test } from 'bun:test';

import type { AskAgent } from './askFacts.ts';
import { asksOf, unseenAsks } from './askFacts.ts';

const agent = (overrides: Partial<AskAgent> = {}): AskAgent => ({
  address: 't1',
  pane: 'p1',
  space: 's1',
  space_name: 'Build window shell',
  tab: 'k1',
  seq: 1,
  program: { name: 'Claude Code' },
  ...overrides,
});

const defaultReport = { state: 'blocked', kind: 'permission', msg: 'bun run up' };

const sources = (
  terminals: readonly unknown[],
  agents: readonly AskAgent[],
  projects: ReadonlyMap<string, string> = new Map([['s1', 'koja']]),
) => ({ terminals, agents, projects });

const blocked = (
  report?: Record<string, unknown>,
  overrides?: Record<string, unknown>,
): Record<string, unknown> => ({
  address: 't1',
  parent: null,
  labels: {},
  turn: 1,
  report: report ?? defaultReport,
  ...overrides,
});

describe('asksOf', () => {
  test('reads a permission ask with its space, agent, question, and command', () => {
    const asks = asksOf(sources([blocked()], [agent()]));

    expect(asks).toHaveLength(1);

    expect(asks[0]).toMatchObject({
      spaceId: 's1',
      spaceName: 'Build window shell',
      tabId: 'k1',
      paneId: 'p1',
      agent: 'Claude Code',
      kind: 'permission',
      question: 'Allow this command?',
      command: 'bun run up',
    });
  });

  test('names the project of the asking space', () => {
    const asks = asksOf(sources([blocked()], [agent()]));

    expect(asks[0]?.project).toBe('koja');
  });

  test('names the space when it has no project', () => {
    const asks = asksOf(sources([blocked()], [agent()], new Map()));

    expect(asks[0]?.project).toBe('Build window shell');
  });

  test('keeps a question ask without a command', () => {
    const report = { state: 'blocked', kind: 'question', msg: 'Which judge model?' };
    const asks = asksOf(sources([blocked(report)], [agent()]));

    expect(asks[0]).toMatchObject({
      question: 'Which judge model?',
      command: null,
    });
  });

  test('keeps a question ask without a message as waiting for an answer', () => {
    const report = { state: 'blocked', kind: 'question', msg: '' };
    const asks = asksOf(sources([blocked(report)], [agent()]));

    expect(asks[0]).toMatchObject({ question: 'Waiting for your answer', command: null });
  });

  test('keeps a permission ask without a message and no command', () => {
    const report = { state: 'blocked', kind: 'permission', msg: '' };
    const asks = asksOf(sources([blocked(report)], [agent()]));

    expect(asks[0]).toMatchObject({ question: 'Allow this command?', command: null });
  });

  test('skips a terminal with no agent', () => {
    expect(asksOf(sources([blocked()], []))).toEqual([]);
  });

  test('skips a worker ask', () => {
    const terminals = [
      blocked(undefined, { labels: { 'tau.role': 'worker' } }),
      blocked(undefined, { address: 't2' }),
    ];

    const asks = asksOf(sources(terminals, [agent(), agent({ address: 't2' })]));

    expect(asks.map((ask) => ask.address)).toEqual(['t2']);
  });

  test('skips a worker ask labeled only by profile', () => {
    const terminals = [
      blocked(undefined, { labels: { 'tau.profile': 'worker' } }),
      blocked(undefined, { address: 't2' }),
    ];

    const asks = asksOf(sources(terminals, [agent(), agent({ address: 't2' })]));

    expect(asks.map((ask) => ask.address)).toEqual(['t2']);
  });

  test('skips a child terminal ask', () => {
    const terminals = [blocked(), blocked(undefined, { address: 't2', parent: 't1' })];

    const asks = asksOf(sources(terminals, [agent(), agent({ address: 't2' })]));

    expect(asks.map((ask) => ask.address)).toEqual(['t1']);
  });

  test('orders the newest ask first', () => {
    const terminals = [
      blocked(undefined, { address: 't1' }),
      blocked(undefined, { address: 't2' }),
    ];

    const agents = [agent({ address: 't1', seq: 4 }), agent({ address: 't2', seq: 9 })];

    const addresses = asksOf(sources(terminals, agents)).map((ask) => ask.address);

    expect(addresses).toEqual(['t2', 't1']);
  });

  test('gives an ask repeated in a later turn its own identity', () => {
    const first = asksOf(sources([blocked(undefined, { turn: 1 })], [agent()]));
    const later = asksOf(sources([blocked(undefined, { turn: 2 })], [agent()]));

    expect(later[0]?.identity).not.toBe(first[0]?.identity);
  });

  test('yields nothing once the ask is answered', () => {
    const report = { state: 'working', kind: null, msg: '' };

    expect(asksOf(sources([blocked(report)], [agent()]))).toEqual([]);
  });
});

describe('unseenAsks', () => {
  const ask = {
    identity: 't1:permission:x',
    address: 't1',
    spaceId: 's1',
    spaceName: 'Build window shell',
    project: 'koja',
    tabId: 'k1',
    paneId: 'p1',
    agent: 'Claude Code',
    kind: 'permission' as const,
    question: 'Allow this command?',
    command: 'bun run up',
    seq: 1,
  };

  test('keeps an ask in another tab while the window is active', () => {
    expect(unseenAsks([ask], { focusedTab: 'k2', windowActive: true })).toEqual([ask]);
  });

  test('drops an ask in the focused tab while the window is active', () => {
    expect(unseenAsks([ask], { focusedTab: 'k1', windowActive: true })).toEqual([]);
  });

  test('keeps an ask in the focused tab while the window is not active', () => {
    expect(unseenAsks([ask], { focusedTab: 'k1', windowActive: false })).toEqual([ask]);
  });
});
