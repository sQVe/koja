import { describe, expect, test } from 'bun:test';

import { hidesAsk } from './hideAsk.ts';

const shownOf = (addresses: string[]): (() => ReadonlySet<string>) => {
  return () => new Set(addresses);
};

describe('hidesAsk', () => {
  test('hides the toast of an ask the card shows', () => {
    const action = { name: 'agent.focus', args: { terminal: 't3' } };

    expect(hidesAsk(action, shownOf(['t3']))).toBe(true);
  });

  test('keeps a toast for a terminal the card does not show', () => {
    const action = { name: 'agent.focus', args: { terminal: 't3' } };

    expect(hidesAsk(action, shownOf([]))).toBe(false);
  });

  test('keeps a toast whose action is not agent.focus', () => {
    const action = { name: 'pane.focus', args: { terminal: 't3' } };

    expect(hidesAsk(action, shownOf(['t3']))).toBe(false);
  });

  test('keeps a toast with no action', () => {
    expect(hidesAsk(null, shownOf(['t3']))).toBe(false);
  });

  test('keeps an agent.focus toast whose terminal is missing or not a string', () => {
    const shown = shownOf(['t3']);

    expect(hidesAsk({ name: 'agent.focus', args: {} }, shown)).toBe(false);
    expect(hidesAsk({ name: 'agent.focus', args: { terminal: 3 } }, shown)).toBe(false);
  });

  test('reads the shown asks only for an agent.focus action', () => {
    let reads = 0;

    const shown = () => {
      reads += 1;

      return new Set(['t3']);
    };

    hidesAsk({ name: 'pane.focus', args: { terminal: 't3' } }, shown);

    expect(reads).toBe(0);
  });
});
