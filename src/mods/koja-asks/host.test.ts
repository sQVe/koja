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

const open = (identity: string, mode: OpenCard['mode'] = 'insert'): OpenCard => ({
  id: 'overlay-1',
  identity,
  mode,
});

describe('planCard', () => {
  test('opens the newest unhandled ask when no card is open', () => {
    const plan = planCard({
      asks: [ask('a')],
      live: [ask('a')],
      handled: [],
      open: null,
      mode: 'insert',
    });

    expect(plan.open?.identity).toBe('a');
    expect(plan.close).toBeNull();
    expect(plan.handled).toEqual([]);
  });

  test('does nothing when the open card already shows the ask in this mode', () => {
    const plan = planCard({
      asks: [ask('a')],
      live: [ask('a')],
      handled: [],
      open: open('a'),
      mode: 'insert',
    });

    expect(plan.open).toBeNull();
    expect(plan.close).toBeNull();
  });

  test('reopens the card when the mode changes', () => {
    const plan = planCard({
      asks: [ask('a')],
      live: [ask('a')],
      handled: [],
      open: open('a'),
      mode: 'normal',
    });

    expect(plan.close).toBe('overlay-1');
    expect(plan.open?.identity).toBe('a');
  });

  test('replaces the card when a newer ask arrives', () => {
    const plan = planCard({
      asks: [ask('b'), ask('a')],
      live: [ask('b'), ask('a')],
      handled: [],
      open: open('a'),
      mode: 'insert',
    });

    expect(plan.close).toBe('overlay-1');
    expect(plan.open?.identity).toBe('b');
  });

  test('closes the card and prunes a handled ask that is gone', () => {
    const plan = planCard({ asks: [], live: [], handled: ['a'], open: open('a'), mode: 'insert' });

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
      open: null,
      mode: 'insert',
    });

    expect(plan.open).toBeNull();
    expect(plan.handled).toEqual(['a']);
    expect(plan.handledChanged).toBe(false);
  });

  test('keeps a handled ask that is still live but no longer unseen', () => {
    const plan = planCard({
      asks: [],
      live: [ask('a')],
      handled: ['a'],
      open: null,
      mode: 'insert',
    });

    expect(plan.handled).toEqual(['a']);
    expect(plan.handledChanged).toBe(false);
    expect(plan.open).toBeNull();
  });

  test('shows the next unhandled ask when the newest one is handled', () => {
    const plan = planCard({
      asks: [ask('b'), ask('a')],
      live: [ask('b'), ask('a')],
      handled: ['b'],
      open: null,
      mode: 'insert',
    });

    expect(plan.open?.identity).toBe('a');
  });
});
