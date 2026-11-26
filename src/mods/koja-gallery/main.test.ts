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
import { emptyFacts, snapshotKey } from '../../data/snapshot.ts';

type ClickHandler = (event: unknown, cx: unknown) => void;

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
  'actionBlock',
  'age',
  'button',
  'contentSection',
  'dialog',
  'documentLine',
  'factRows',
  'hoverCard',
  'icon',
  'iconNames',
  'itemHeader',
  'listRow',
  'partNote',
  'popupSurface',
  'projectHeader',
  'roleBadge',
  'searchField',
  'sectionHeader',
  'size',
  'sourceLink',
  'spaceFooter',
  'splitButton',
  'stackProgress',
  'stateLine',
  'statusMark',
  'statusRow',
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

const drawnParts = (element: DrawnElement): DrawnElement[] =>
  Array.isArray(element.kids) ? [element, ...element.kids.flatMap(drawnParts)] : [element];

const partTexts = (element: DrawnElement): string[] =>
  Array.isArray(element.texts) ? element.texts : [];

const clickHandlers = (element: DrawnElement): ClickHandler[] =>
  Array.isArray(element.clickHandlers) ? element.clickHandlers : [];

// The gallery draws mocked fields, which are not drawn elements, so walk only the drawn children.
const clickableWithText = (element: DrawnElement, text: string): DrawnElement | undefined =>
  drawnParts(element).find(
    (part) => clickHandlers(part).length > 0 && drawnParts(part).flatMap(partTexts).includes(text),
  );

describe('gallery section folding', () => {
  test('opens the folded Files section from its header', () => {
    const view = openGallery();
    const before = view.render(context);

    expect(drawnTexts(before)).not.toContain('src/kit/sectionHeader.ts');

    const header = clickableWithText(before, 'Files');

    if (header === undefined) {
      throw new Error('The gallery draws no foldable Files header.');
    }

    clickHandlers(header)[0]?.({}, context);

    expect(notifyCalls).toBe(1);
    expect(drawnTexts(view.render(context))).toContain('src/kit/sectionHeader.ts');
  });
});
