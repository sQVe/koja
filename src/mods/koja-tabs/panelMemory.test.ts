import { describe, expect, test } from 'bun:test';

import type { PanelMemory, PanelView } from './panelMemory.ts';
import { initialPanelMemory, panelMemory, restoreMilliseconds } from './panelMemory.ts';

const view = (overrides: Partial<PanelView> = {}): PanelView => ({
  now: 'files',
  space: 's1',
  enabled: ['files', 'changes'],
  time: 1_000,
  ...overrides,
});

const memory = (overrides: Partial<PanelMemory> = {}): PanelMemory => ({
  ...initialPanelMemory({}),
  ...overrides,
});

describe('panelMemory', () => {
  test('records the shown panel for the first space with no memory', () => {
    const result = panelMemory(memory(), view());

    expect(result.persisted).toBe(true);
    expect(result.memory.stored).toEqual({ s1: 'files' });
    expect(result.effect.kind).toBe('none');
  });

  test('asks for the stored panel when switching space', () => {
    const result = panelMemory(
      memory({ space: 's1', stored: { s1: 'files', s2: 'changes' } }),
      view({ space: 's2', now: 'files' }),
    );

    expect(result.effect).toEqual({ kind: 'show', panel: 'changes' });

    expect(result.memory.pending).toEqual({
      want: 'changes',
      until: 1_000 + restoreMilliseconds,
    });

    expect(result.persisted).toBe(false);
  });

  test('hides the panel when the stored one is not offered', () => {
    const result = panelMemory(
      memory({ space: 's1', stored: { s1: 'changes' } }),
      view({ space: 's2', enabled: ['files'] }),
    );

    expect(result.effect).toEqual({ kind: 'show', panel: null });
  });

  test('ignores a different shown panel before the restore deadline', () => {
    const held = memory({
      space: 's2',
      stored: { s2: 'changes' },
      pending: { want: 'changes', until: 1_100 },
    });

    const result = panelMemory(held, view({ space: 's2', time: 1_050 }));

    expect(result.memory).toBe(held);
    expect(result.persisted).toBe(false);
  });

  test('records the shown panel once the restore deadline has passed', () => {
    const held = memory({
      space: 's2',
      stored: { s2: 'changes' },
      pending: { want: 'changes', until: 1_100 },
    });

    const result = panelMemory(held, view({ space: 's2', time: 1_100 }));

    expect(result.persisted).toBe(true);
    expect(result.memory.stored).toEqual({ s2: 'files' });
    expect(result.memory.pending).toBeNull();
  });

  test('does nothing when the stored panel is already shown', () => {
    const result = panelMemory(
      memory({ space: 's2', stored: { s2: 'files' } }),
      view({ space: 's2' }),
    );

    expect(result.persisted).toBe(false);
    expect(result.effect.kind).toBe('none');
  });
});
