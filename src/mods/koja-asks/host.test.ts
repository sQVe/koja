import { describe, expect, test } from 'bun:test';

import type { Ask } from './askFacts.ts';
import type { OpenCard } from './host.ts';
import { planCard } from './host.ts';

const ask = (identity: string): Ask => ({
  identity,
  address: identity,
  spaceId: 's1',
  spaceName: 'Build window shell',
  tabId: 'k1',
  paneId: 'p1',
  agent: 'Claude Code',
  kind: 'permission',
  question: 'Allow this command?',
  command: 'bun run up',
  seq: 1,
});

const open = (identity: string, signature = `sig-${identity}`): OpenCard => ({
  id: 'overlay-1',
  identity,
  signature,
});

const signatures = (...identities: string[]): Map<string, string> =>
  new Map(identities.map((identity) => [identity, `sig-${identity}`]));

describe('planCard', () => {
  test('opens the newest unhandled ask when no card is open', () => {
    const plan = planCard({
      asks: [ask('a')],
      live: [ask('a')],
      handled: [],
      visible: [],
      open: null,
      signatures: signatures('a'),
    });

    expect(plan.open?.identity).toBe('a');
    expect(plan.close).toBeNull();
    expect(plan.handled).toEqual([]);
  });

  test('does nothing when the open card already shows the ask with the same signature', () => {
    const plan = planCard({
      asks: [ask('a')],
      live: [ask('a')],
      handled: [],
      visible: [],
      open: open('a'),
      signatures: signatures('a'),
    });

    expect(plan.open).toBeNull();
    expect(plan.close).toBeNull();
  });

  test('reopens the card when its content or geometry changes', () => {
    const plan = planCard({
      asks: [ask('a')],
      live: [ask('a')],
      handled: [],
      visible: [],
      open: open('a', 'old'),
      signatures: signatures('a'),
    });

    expect(plan.close).toBe('overlay-1');
    expect(plan.open?.identity).toBe('a');
  });

  test('replaces the card when a newer ask arrives', () => {
    const plan = planCard({
      asks: [ask('b'), ask('a')],
      live: [ask('b'), ask('a')],
      handled: [],
      visible: [],
      open: open('a'),
      signatures: signatures('a', 'b'),
    });

    expect(plan.close).toBe('overlay-1');
    expect(plan.open?.identity).toBe('b');
  });

  test('closes the card and prunes a handled ask that is gone', () => {
    const plan = planCard({
      asks: [],
      live: [],
      handled: ['a'],
      visible: [],
      open: open('a'),
      signatures: new Map(),
    });

    expect(plan.close).toBe('overlay-1');
    expect(plan.open).toBeNull();
    expect(plan.handled).toEqual([]);
    expect(plan.handledChanged).toBe(true);
  });

  test('keeps a handled ask while it is still unseen', () => {
    const plan = planCard({
      asks: [ask('a')],
      live: [ask('a')],
      handled: ['a'],
      visible: [],
      open: null,
      signatures: signatures('a'),
    });

    expect(plan.open).toBeNull();
    expect(plan.handled).toEqual(['a']);
    expect(plan.handledChanged).toBe(false);
  });

  test('saves an ask that became visible as handled', () => {
    const plan = planCard({
      asks: [],
      live: [ask('a')],
      handled: [],
      visible: ['a'],
      open: null,
      signatures: new Map(),
    });

    expect(plan.handled).toEqual(['a']);
    expect(plan.handledChanged).toBe(true);
    expect(plan.open).toBeNull();
  });

  test('shows the next unhandled ask when the newest one is handled', () => {
    const plan = planCard({
      asks: [ask('b'), ask('a')],
      live: [ask('b'), ask('a')],
      handled: ['b'],
      visible: [],
      open: null,
      signatures: signatures('a', 'b'),
    });

    expect(plan.open?.identity).toBe('a');
  });
});
