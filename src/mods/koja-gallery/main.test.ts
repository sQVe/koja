import { afterAll, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

import { click, clickablesWithText, descendants, drawnTexts } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import { mockGalleryModules } from '../../../tests/gallery.ts';
import { heartbeatKey, leaseExpiryMilliseconds } from '../../data/lease.ts';
import { emptyFacts, snapshotKey } from '../../data/snapshot.ts';

interface FakeView {
  init: (props: unknown, cx: unknown) => void;
  render: (cx: unknown) => DrawnElement;
}

interface DeadlineTask {
  milliseconds: number;
  handler: (cx: unknown) => void;
  cancelled: boolean;
}

let sharedValues: Record<string, unknown> = {};
let tasks: DeadlineTask[] = [];
let notifyCalls = 0;

Object.assign(globalThis, { kojaModName: 'koja' });

const kitFake = await mockGalleryModules({ shared: (key: string) => sharedValues[key] });

await mock.module('../../kit/index.ts', () => kitFake);

const modulePath = './main.ts';

const loaded = (await import(modulePath)) as { default: new () => FakeView };

afterAll(() => {
  mock.restore();
  setSystemTime();
});

const start = 1_800_000_000_000;

const context = {
  notify: () => {
    notifyCalls += 1;
  },
  stop_propagation: () => undefined,
  timer: {
    after: (milliseconds: number, handler: (cx: unknown) => void) => {
      const task: DeadlineTask = { milliseconds, handler, cancelled: false };

      tasks.push(task);

      return {
        cancel: () => {
          task.cancelled = true;
        },
        is_done: () => false,
      };
    },
  },
};

const writeHeartbeat = (at: number): void => {
  sharedValues[heartbeatKey] = { version: 1, owner: 'window-a', generation: 1, at };
};

const openGallery = (): FakeView => {
  const view = new loaded.default();

  view.init({}, context);

  return view;
};

const liveTasks = (): DeadlineTask[] => tasks.filter((task) => !task.cancelled);

// The Checks section that draws this age, which tells the live specimen from the stale one.
const checksSectionWith = (gallery: DrawnElement, age: string): DrawnElement => {
  const found = descendants(gallery).find(
    (part) => clickablesWithText(part, 'Checks').length === 1 && drawnTexts(part).includes(age),
  );

  if (found === undefined) {
    throw new Error(`The gallery draws no Checks section with ${age}.`);
  }

  return found;
};

const checksHeaderOf = (gallery: DrawnElement, age: string): DrawnElement => {
  const [header] = clickablesWithText(checksSectionWith(gallery, age), 'Checks');

  if (header === undefined) {
    throw new Error('The Checks section draws no foldable header.');
  }

  return header;
};

beforeEach(() => {
  sharedValues = { [snapshotKey]: { version: 6, revision: 1, facts: emptyFacts() } };
  tasks = [];
  notifyCalls = 0;
  setSystemTime(start);
  writeHeartbeat(start);
});

describe('gallery data layer section', () => {
  test('turns stale when its deadline task fires with no new write', () => {
    const view = openGallery();

    expect(drawnTexts(view.render(context))).toContain('Live');

    setSystemTime(start + leaseExpiryMilliseconds);
    liveTasks()[0]?.handler(context);

    expect(notifyCalls).toBe(1);
    expect(drawnTexts(view.render(context))).toContain('Stale');
  });

  test('waits for the heartbeat deadline in one task', () => {
    const view = openGallery();

    setSystemTime(start + 4000);
    view.render(context);
    view.render(context);

    const taskTimes = liveTasks().map((task) => task.milliseconds);

    expect(taskTimes).toEqual([leaseExpiryMilliseconds - 4000]);
  });

  test('replaces its deadline task when a new heartbeat moves the deadline', () => {
    const view = openGallery();

    view.render(context);
    const renewedAt = start + 10_000;

    setSystemTime(renewedAt);
    writeHeartbeat(renewedAt);
    view.render(context);

    const taskTimes = liveTasks().map((task) => task.milliseconds);

    expect(taskTimes).toEqual([leaseExpiryMilliseconds]);
    expect(tasks).toHaveLength(2);
  });

  test('starts no deadline task while the data layer is unavailable', () => {
    sharedValues = {};
    const view = openGallery();

    expect(drawnTexts(view.render(context))).toContain('Unavailable');
    expect(tasks).toEqual([]);
  });
});

describe('gallery section folding', () => {
  test('folds one Checks specimen without folding the other, then opens it again', () => {
    const view = openGallery();
    const before = view.render(context);
    const liveHeader = checksHeaderOf(before, 'started 2m ago');

    click(liveHeader, context);

    const folded = view.render(context);

    expect(drawnTexts(folded)).not.toContain('started 2m ago');
    expect(drawnTexts(folded)).toContain('started 8m ago');

    click(liveHeader, context);

    expect(drawnTexts(view.render(context))).toContain('started 2m ago');
  });

  test('opens the folded Files section from its header', () => {
    const view = openGallery();
    const before = view.render(context);

    expect(drawnTexts(before)).not.toContain('src/kit/sectionHeader.ts');

    const [header] = clickablesWithText(before, 'Files');

    if (header === undefined) {
      throw new Error('The gallery draws no foldable Files header.');
    }

    click(header, context);

    expect(notifyCalls).toBe(1);
    expect(drawnTexts(view.render(context))).toContain('src/kit/sectionHeader.ts');
  });
});

describe('gallery retry wiring', () => {
  test('reads the Checks part again when its stale note is retried', () => {
    const view = openGallery();
    const before = view.render(context);

    expect(drawnTexts(before)).toContain('started 8m ago');

    const [retry] = clickablesWithText(before, 'Retry');

    if (retry === undefined) {
      throw new Error('The gallery draws no Retry.');
    }

    click(retry, context);

    expect(notifyCalls).toBe(1);

    const after = drawnTexts(view.render(context));

    expect(after).not.toContain('started 8m ago');
    expect(after).not.toContain('started 7m ago');
    expect(after.some((text) => text.includes('6m ago'))).toBe(false);
    expect(after).toContain('started 2m ago');
  });
});
