import { describe, expect, test } from 'bun:test';

import type { JumpPane, JumpSpace, JumpTarget } from './needsYouJump.ts';
import { needsYouTarget } from './needsYouJump.ts';

const spaces: JumpSpace[] = [
  { id: 'a', tabs: [{ id: 'a-1' }] },
  { id: 'b', tabs: [{ id: 'b-1' }, { id: 'b-2' }] },
];

const panes: JumpPane[] = [
  { pane: 'a-idle', tab: 'a-1', status: 'idle' },
  { pane: 'a-done', tab: 'a-1', status: 'done' },
  { pane: 'b-late', tab: 'b-2', status: 'working' },
  { pane: 'b-idle', tab: 'b-1', status: 'idle' },
  { pane: 'b-blocked', tab: 'b-1', status: 'blocked' },
];

const sidebarOrder = ['b', 'a'];

const inA: JumpTarget = { space: 'a', tab: 'a-1', pane: 'a-done' };

const inB: JumpTarget = { space: 'b', tab: 'b-1', pane: 'b-blocked' };

const target = (
  step: 1 | -1,
  focusedPane: string | null,
  given: JumpPane[] = panes,
): JumpTarget | null =>
  needsYouTarget({ step, visibleSpaces: sidebarOrder, spaces, panes: given, focusedPane });

const withStatus = (given: JumpPane[], pane: string, status: JumpPane['status']): JumpPane[] =>
  given.map((item) => (item.pane === pane ? { ...item, status } : item));

describe('needsYouTarget in sidebar order', () => {
  test('walks the needing panes of two spaces forward and back', () => {
    expect(target(1, 'b-idle')).toEqual(inB);
    expect(target(1, 'b-blocked')).toEqual(inA);
    expect(target(-1, 'a-done')).toEqual(inB);
  });

  test('wraps past the last pane going forward and past the first going back', () => {
    expect(target(1, 'a-done')).toEqual(inB);
    expect(target(-1, 'b-blocked')).toEqual(inA);
  });

  test('orders the tabs of a space as the space lists them', () => {
    const given = withStatus(panes, 'b-late', 'done');

    expect(target(1, 'b-blocked', given)).toEqual({ space: 'b', tab: 'b-2', pane: 'b-late' });
    expect(target(-1, 'b-idle', given)).toEqual(inA);
  });

  test('skips a visible space id that has no live space', () => {
    const found = needsYouTarget({
      step: 1,
      visibleSpaces: ['gone', 'b', 'a'],
      spaces,
      panes,
      focusedPane: null,
    });

    expect(found).toEqual(inB);
  });

  test('skips a space the sidebar hides', () => {
    const found = needsYouTarget({
      step: 1,
      visibleSpaces: ['b'],
      spaces,
      panes,
      focusedPane: 'b-idle',
    });

    const fromOnlyShownNeeder = needsYouTarget({
      step: 1,
      visibleSpaces: ['b'],
      spaces,
      panes,
      focusedPane: 'b-blocked',
    });

    expect(found).toEqual(inB);
    expect(fromOnlyShownNeeder).toBeNull();
  });
});

describe('needsYouTarget without a pane to go to', () => {
  test('returns null when no pane needs the user', () => {
    const calm = withStatus(withStatus(panes, 'a-done', 'idle'), 'b-blocked', null);

    expect(target(1, 'b-idle', calm)).toBeNull();
    expect(target(-1, 'b-idle', calm)).toBeNull();
  });

  test('returns null when only the focused pane needs the user', () => {
    const onlyFocused = withStatus(panes, 'a-done', 'working');

    expect(target(1, 'b-blocked', onlyFocused)).toBeNull();
    expect(target(-1, 'b-blocked', onlyFocused)).toBeNull();
  });
});

describe('needsYouTarget without a focused pane in the walk', () => {
  test('next starts at the first pane and previous at the last', () => {
    expect(target(1, null)).toEqual(inB);
    expect(target(-1, null)).toEqual(inA);
    expect(target(1, 'gone')).toEqual(inB);
    expect(target(-1, 'gone')).toEqual(inA);
  });
});
