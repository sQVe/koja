import { describe, expect, test } from 'bun:test';

import type { DueState, DueWorld } from './due.ts';
import { afterScan, emptyDue, markDirty, readDue, readRequest, skipDue, tickDue } from './due.ts';

const world = (changes: Partial<DueWorld> = {}): DueWorld => ({
  visible: true,
  shownAgain: false,
  loading: false,
  busy: false,
  now: 1000,
  ...changes,
});

const due = (changes: Partial<DueState> = {}): DueState => ({ ...emptyDue('a'), ...changes });

describe('tickDue', () => {
  test('catches up when the window is shown again after an edit a watch could not report', () => {
    const state = tickDue(due({ dirtyAt: 500 }), world({ shownAgain: true }), true);

    expect(state.catchUp).toBe(true);
  });

  test('catches up when the window is shown again with no watch running', () => {
    const state = tickDue(due(), world({ shownAgain: true }), false);

    expect(state.catchUp).toBe(true);
  });

  test('catches nothing up when the window stayed shown', () => {
    const state = tickDue(due({ dirtyAt: 500 }), world(), true);

    expect(state.catchUp).toBe(false);
  });
});

describe('readDue', () => {
  test('reads nothing while the window is hidden', () => {
    expect(readDue(due({ pollAt: 1 }), world({ visible: false }))).toBe(false);
  });

  test('reads nothing during a load or a commit', () => {
    expect(readDue(due({ pollAt: 1 }), world({ loading: true }))).toBe(false);
    expect(readDue(due({ pollAt: 1 }), world({ busy: true }))).toBe(false);
  });

  test('reads at once when the window was shown again', () => {
    expect(readDue(due({ catchUp: true, pollAt: 9000 }), world())).toBe(true);
  });

  test('waits for the watch delay after an edit', () => {
    const state = due({ dirtyAt: 900, watchAt: 1500, pollAt: 9000 });

    expect(readDue(state, world({ now: 1400 }))).toBe(false);
    expect(readDue(state, world({ now: 1500 }))).toBe(true);
  });

  test('reads again once the poll time passes', () => {
    expect(readDue(due({ pollAt: 2000 }), world({ now: 1999 }))).toBe(false);
    expect(readDue(due({ pollAt: 2000 }), world({ now: 2000 }))).toBe(true);
  });
});

describe('readRequest', () => {
  test('a visit reads at once, even from a hidden window', () => {
    const { request } = readRequest(due(), 1000, true, false);

    expect(request).toEqual({ after: 1001, visiting: true, urgent: true, allowHidden: true });
  });

  test('a repeat read asks for a scan newer than the last one', () => {
    const { request } = readRequest(due({ lastStatus: 700 }), 1000, false, false);

    expect(request.after).toBe(701);
    expect(request.urgent).toBe(false);
  });

  test('a forced read arms an edit so the scan it starts cannot answer it', () => {
    const { due: armed, request } = readRequest(due(), 1000, false, true);

    expect(armed.dirtyAt).toBe(1001);
    expect(request.after).toBe(1001);
    expect(request.urgent).toBe(true);
    expect(request.allowHidden).toBe(true);
  });

  test('a request clears the catch-up it used and waits a poll before the next read', () => {
    const { due: next } = readRequest(due({ catchUp: true }), 1000, false, false);

    expect(next.catchUp).toBe(false);
    expect(next.pollAt).toBe(11000);
    expect(next.watchAt).toBe(11000);
  });
});

describe('afterScan', () => {
  const timing = { started: 1200, pollAt: 11200, watchAt: 11200 };

  test('keeps the poll times the scan measured', () => {
    const next = afterScan(due({ dirtyAt: 900 }), timing, {
      after: 901,
      visiting: false,
      urgent: false,
      allowHidden: false,
    });

    expect(next.pollAt).toBe(11200);
    expect(next.lastStatus).toBe(1200);
  });

  test('clears the edit a scan already saw', () => {
    const next = afterScan(due({ dirtyAt: 900 }), timing, {
      after: 901,
      visiting: false,
      urgent: false,
      allowHidden: false,
    });

    expect(next.dirtyAt).toBe(0);
  });

  test('keeps an edit that arrived after the scan started', () => {
    const next = afterScan(due({ dirtyAt: 1300 }), timing, {
      after: 1301,
      visiting: false,
      urgent: true,
      allowHidden: false,
    });

    expect(next.dirtyAt).toBe(1300);
  });

  test('asks for another read when the scan started before the request', () => {
    const next = afterScan(due(), timing, {
      after: 1300,
      visiting: false,
      urgent: true,
      allowHidden: false,
    });

    expect(next.catchUp).toBe(true);
  });

  test('asks for no second read when the scan answered the request', () => {
    const next = afterScan(due(), timing, {
      after: 901,
      visiting: false,
      urgent: true,
      allowHidden: false,
    });

    expect(next.catchUp).toBe(false);
  });
});

describe('skipDue', () => {
  test('polls again later and forgets the edit and the catch-up', () => {
    const next = skipDue(due({ dirtyAt: 900, catchUp: true }), 1000);

    expect(next).toEqual({ ...emptyDue('a'), pollAt: 11000 });
  });
});

describe('markDirty', () => {
  test('marks the edit one tick ahead so a scan started now cannot see it', () => {
    expect(markDirty(due(), 1000).dirtyAt).toBe(1001);
  });
});
