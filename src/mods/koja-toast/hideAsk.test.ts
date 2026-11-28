import { describe, expect, test } from 'bun:test';

import { hidesAsk } from './hideAsk.ts';

describe('hidesAsk', () => {
  test('hides the toast of an ask the card shows', () => {
    const action = { name: 'agent.focus', args: { terminal: 't3' } };

    expect(hidesAsk(action, new Set(['t3']))).toBe(true);
  });

  test('keeps a toast for a terminal the card does not show', () => {
    const action = { name: 'agent.focus', args: { terminal: 't3' } };

    expect(hidesAsk(action, new Set())).toBe(false);
  });

  test('keeps a toast whose action is not agent.focus', () => {
    const action = { name: 'pane.focus', args: { terminal: 't3' } };

    expect(hidesAsk(action, new Set(['t3']))).toBe(false);
  });

  test('keeps a toast with no action', () => {
    expect(hidesAsk(null, new Set(['t3']))).toBe(false);
  });
});
