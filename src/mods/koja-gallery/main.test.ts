import { afterAll, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

import { drawn, drawnTexts } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  chainable,
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { heartbeatKey, leaseExpiryMilliseconds } from '../../data/lease.ts';
import { snapshotKey } from '../../data/snapshot.ts';

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

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    h_flex: () => drawn(),
    v_flex: () => drawn(),
    InputState: { new: () => chainable() },
  }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () =>
  herdrFake({ shared: (key: string) => sharedValues[key], theme: () => ({}) }),
);

const kitFake = await realKitIndexFake([
  'age',
  'button',
  'dialog',
  'hoverCard',
  'icon',
  'iconNames',
  'listRow',
  'popupSurface',
  'projectHeader',
  'searchField',
  'sectionHeader',
  'size',
  'spaceFooter',
  'stackProgress',
  'stateLine',
  'statusMark',
  'tab',
  'text',
  'textField',
  'textRole',
  'theme',
  'viewSwitch',
  'workIcon',
]);

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

beforeEach(() => {
  sharedValues = { [snapshotKey]: { version: 1, revision: 1, facts: {} } };
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

    expect(liveTasks().map((task) => task.milliseconds)).toEqual([leaseExpiryMilliseconds - 4000]);
  });

  test('replaces its deadline task when a new heartbeat moves the deadline', () => {
    const view = openGallery();

    view.render(context);
    const renewedAt = start + 10_000;

    setSystemTime(renewedAt);
    writeHeartbeat(renewedAt);
    view.render(context);

    expect(liveTasks().map((task) => task.milliseconds)).toEqual([leaseExpiryMilliseconds]);
    expect(tasks).toHaveLength(2);
  });

  test('starts no deadline task while the data layer is unavailable', () => {
    sharedValues = {};
    const view = openGallery();

    expect(drawnTexts(view.render(context))).toContain('Unavailable');
    expect(tasks).toEqual([]);
  });
});
