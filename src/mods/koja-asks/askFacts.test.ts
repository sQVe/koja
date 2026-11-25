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

const blocked = (
  report?: Record<string, unknown>,
  overrides?: Record<string, unknown>,
): Record<string, unknown> => ({
  address: 't1',
  parent: null,
  labels: {},
  report: report ?? defaultReport,
  ...overrides,
});

describe('asksOf', () => {
  test('reads an unseen permission ask with its space, agent, question, and command', () => {
    const asks = asksOf({ terminals: [blocked()], agents: [agent()] });

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

  test('keeps a question ask without a command', () => {
    const report = { state: 'blocked', kind: 'question', msg: 'Which judge model?' };
    const asks = asksOf({ terminals: [blocked(report)], agents: [agent()] });

    expect(asks[0]).toMatchObject({
      question: 'Which judge model?',
      command: null,
    });
  });

  test('skips a worker ask and a child terminal ask', () => {
    const terminals = [
      blocked(undefined, { labels: { 'tau.role': 'worker' } }),
      blocked(undefined, { address: 't2', parent: 't1' }),
    ];

    const agents = [agent(), agent({ address: 't2' })];

    expect(asksOf({ terminals, agents })).toEqual([]);
  });

  test('orders the newest ask first', () => {
    const terminals = [
      blocked(undefined, { address: 't1' }),
      blocked(undefined, { address: 't2' }),
    ];

    const agents = [agent({ address: 't1', seq: 4 }), agent({ address: 't2', seq: 9 })];

    const addresses = asksOf({ terminals, agents }).map((ask) => ask.address);

    expect(addresses).toEqual(['t2', 't1']);
  });

  test('yields nothing once the ask is answered', () => {
    const report = { state: 'working', kind: null, msg: '' };

    expect(asksOf({ terminals: [blocked(report)], agents: [agent()] })).toEqual([]);
  });
});

describe('unseenAsks', () => {
  const ask = {
    identity: 't1:permission:x',
    address: 't1',
    spaceId: 's1',
    spaceName: 'Build window shell',
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
