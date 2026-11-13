import { afterAll, beforeEach, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';
import { runNormalKeys, takeNormalKeys } from '../../kit/normalRun.ts';
import type { HelpGroup } from './rows.ts';
import { helpGroups } from './rows.ts';

interface KeyContext {
  stop_propagation: () => void;
  notify: () => void;
}

type KeyHandler = (event: { key: string }, cx?: KeyContext) => void;

interface RunCall {
  command: string;
  args: Record<string, unknown> | undefined;
}

let keyHandler: KeyHandler | undefined;
let changeHandler: (() => void) | undefined;
let submitHandler: (() => void) | undefined;
let selectedRows: string[] = [];
let scrollCalls: number[] = [];
let stoppedKeys = 0;
let notifiedKeys = 0;
let runCalls: RunCall[] = [];
let sharedValues: Record<string, unknown> = {};
let query = '';
let closeCalls = 0;
let recordedCloses = 0;
let drawnKeys: string[] = [];
let drawnRows: string[] = [];
let drawnStates: string[] = [];
let trackedHandles: unknown[] = [];

const element = (): unknown => {
  const node: unknown = new Proxy(() => undefined, {
    get: (_target, key) => {
      if (key === 'then') {
        return undefined;
      }

      if (key === 'on_key_down') {
        return (handler: KeyHandler) => {
          keyHandler = handler;

          return node;
        };
      }

      if (key === 'track_focus') {
        return (handle: unknown) => {
          trackedHandles.push(handle);

          return node;
        };
      }

      return () => node;
    },
  });

  return node;
};

const input = {
  on: (name: string, handler: (event: unknown, context: unknown) => void) => {
    if (name === 'change') {
      changeHandler = () => {
        handler(undefined, { notify: () => undefined });
      };
    }

    if (name === 'submit') {
      submitHandler = () => {
        handler(undefined, { notify: () => undefined });
      };
    }
  },
  focus: () => undefined,
  value: () => query,
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    InputState: { new: () => input },
    ScrollHandle: {
      new: () => ({
        scroll_to_item: (index: number) => {
          scrollCalls.push(index);
        },
      }),
    },
    v_flex: element,
  }),
);

await mock.module('herdr', () =>
  herdrFake({
    run: (command: string, args?: Record<string, unknown>) => {
      runCalls.push({ command, args });

      return null;
    },
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;

      return null;
    },
    shared: (key: string) => sharedValues[key],
  }),
);

const herdrStore = {
  shared: (key: string): unknown => sharedValues[key],
  setShared: (key: string, value: unknown): void => {
    sharedValues[key] = value;
  },
};

await mock.module('gpui-kit', () =>
  gpuiKitFake({
    View: class {
      render(): unknown {
        return null;
      }
    },
  }),
);

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    popupSurface: element,
    overlaySize: {},
    searchField: element,
    sectionHeader: element,
    stateLine: (state: { text: string }) => {
      drawnStates.push(state.text);

      return element();
    },
    detailText: element,
    keyHint: (keys: string) => {
      drawnKeys.push(keys);

      return element();
    },
    listRow: (row: { label: string; state: string }) => {
      drawnRows.push(row.label);

      if (row.state === 'selected') {
        selectedRows.push(row.label);
      }

      return element();
    },
    closeOverlay: () => {
      closeCalls += 1;
    },
    recordOverlayClose: () => {
      recordedCloses += 1;
    },
    runNormalKeys,
  }),
);

const modulePath = './main.ts';

const loaded = (await import(modulePath)) as {
  default: new () => {
    init: (props: unknown, context: unknown) => void;
    render: () => unknown;
    close: () => void;
  };
};

beforeEach(() => {
  keyHandler = undefined;
  changeHandler = undefined;
  query = '';
  closeCalls = 0;
  recordedCloses = 0;
  drawnKeys = [];
  drawnRows = [];
  drawnStates = [];
  trackedHandles = [];
  submitHandler = undefined;
  selectedRows = [];
  scrollCalls = [];
  stoppedKeys = 0;
  notifiedKeys = 0;
  runCalls = [];
  sharedValues = {};
});

afterAll(() => {
  mock.restore();
});

const context = {
  focus_handle: () => ({}),
  timer: { after: () => undefined },
};

const keyContext: KeyContext = {
  stop_propagation: () => {
    stoppedKeys += 1;
  },
  notify: () => {
    notifiedKeys += 1;
  },
};

const press = (key: string): void => {
  keyHandler?.({ key }, keyContext);
};

const shownNames = (groups: HelpGroup[]): string[] =>
  groups.flatMap((group) => group.rows.map((row) => row.name));

const selectedAfterRender = (view: { render: () => unknown }): (string | undefined)[] => {
  selectedRows = [];
  view.render();

  return selectedRows;
};

const openHelp = (filter = ''): { render: () => unknown } => {
  const view = new loaded.default();

  view.init(undefined, context);

  if (filter !== '') {
    query = filter;
    changeHandler?.();
  }

  view.render();

  return view;
};

test('help selects the first shown row on open and again after a filter change', () => {
  const view = openHelp();
  const allNames = shownNames(helpGroups(''));

  expect(selectedRows).toEqual(allNames.slice(0, 1));

  press('down');

  expect(selectedAfterRender(view)).toEqual([allNames[1]]);

  query = 'space';
  changeHandler?.();

  expect(selectedAfterRender(view)).toEqual([shownNames(helpGroups('space'))[0]]);
});

test('Down and Up move the selected row across groups and stop at the first and last row', () => {
  const groups = helpGroups('next');
  const names = shownNames(groups);
  const firstGroupSize = groups[0]?.rows.length ?? 0;

  expect(groups.length).toBeGreaterThan(1);

  const view = openHelp('next');

  press('up');

  expect(selectedAfterRender(view)).toEqual([names[0]]);

  for (let step = 0; step < firstGroupSize; step += 1) {
    press('down');
  }

  expect(selectedAfterRender(view)).toEqual([names[firstGroupSize]]);

  for (let step = 0; step <= names.length; step += 1) {
    press('down');
  }

  expect(selectedAfterRender(view)).toEqual([names.at(-1)]);

  press('up');

  expect(selectedAfterRender(view)).toEqual([names.at(-2)]);
  expect(stoppedKeys).toBe(names.length + firstGroupSize + 3);
  expect(notifiedKeys).toBe(stoppedKeys);
});

test('moving the selected row scrolls the list to show it, with the group header above the first row', () => {
  const groups = helpGroups('next');
  const firstGroupSize = groups[0]?.rows.length ?? 0;
  const firstGroupChildren = 1 + (groups[0]?.note === undefined ? 0 : 1) + firstGroupSize;
  const secondGroupNotes = groups[1]?.note === undefined ? 0 : 1;

  openHelp('next');

  for (let step = 0; step < firstGroupSize; step += 1) {
    press('down');
  }

  expect(scrollCalls.at(-1)).toBe(firstGroupChildren + 1 + secondGroupNotes);

  for (let step = 0; step < firstGroupSize; step += 1) {
    press('up');
  }

  expect(scrollCalls.at(-1)).toBe(0);
});

test('Enter closes the help and runs the selected row through normal mode when it is on', () => {
  sharedValues['koja-modal'] = true;

  const selectedKeys = helpGroups('')
    .flatMap((group) => group.rows)
    .at(1)?.keys[0];

  openHelp();
  press('down');
  submitHandler?.();

  expect(closeCalls).toBe(1);
  expect(recordedCloses).toBe(1);
  expect(runCalls).toEqual([{ command: 'koja-modal.run-keys', args: undefined }]);
  expect(takeNormalKeys(herdrStore)).toEqual(selectedKeys ?? null);
});

test('Enter opens normal mode to run the selected row when normal mode is off', () => {
  const selectedKeys = helpGroups('')
    .flatMap((group) => group.rows)
    .at(0)?.keys[0];

  openHelp();
  submitHandler?.();

  expect(closeCalls).toBe(1);
  expect(recordedCloses).toBe(1);
  expect(runCalls).toEqual([{ command: 'mod.open', args: { name: 'koja-modal' } }]);
  expect(takeNormalKeys(herdrStore)).toEqual(selectedKeys ?? null);
});

test('Enter with no shown row keeps the help open and runs nothing', () => {
  sharedValues['koja-modal'] = true;

  openHelp('no matching key');
  submitHandler?.();

  expect(closeCalls).toBe(0);
  expect(recordedCloses).toBe(0);
  expect(runCalls).toEqual([]);
  expect(takeNormalKeys(herdrStore)).toBeNull();
});

test('help draws normal keys, filters spaces, and closes on Escape', () => {
  const view = new loaded.default();

  view.init(undefined, context);
  view.render();

  expect(drawnKeys).toContain('s j');
  expect(drawnKeys).toContain('t n');
  expect(drawnKeys).toContain('?');

  query = 'space';
  changeHandler?.();
  drawnKeys = [];
  drawnRows = [];
  view.render();

  expect(drawnKeys).toContain('s j');
  expect(drawnKeys).not.toContain('t n');

  const matching = helpGroups('space').flatMap((group) => group.rows.map((row) => row.name));

  expect(drawnRows).toEqual(matching);
  expect(drawnRows).toContain('Next space');
  expect(drawnRows).not.toContain('New tab');

  keyHandler?.({ key: 'escape' });

  expect(closeCalls).toBe(1);
  expect(recordedCloses).toBe(1);
});

test('help shows the pane note only while pane rows match', () => {
  const view = new loaded.default();

  view.init(undefined, context);
  view.render();

  expect(drawnStates).toContain('Every key here also works after ctrl-w.');

  query = 'space';
  changeHandler?.();
  drawnStates = [];
  drawnRows = [];
  view.render();

  expect(drawnRows.length).toBeGreaterThan(0);
  expect(drawnStates).toEqual([]);
});

test('help shows the empty state only when no rows match', () => {
  const view = new loaded.default();

  view.init(undefined, context);
  query = 'no matching key';
  changeHandler?.();
  view.render();

  expect(drawnRows).toEqual([]);
  expect(drawnStates).toEqual(['Nothing matches "no matching key".']);

  query = 'space';
  changeHandler?.();
  drawnStates = [];
  view.render();

  expect(drawnRows.length).toBeGreaterThan(0);
  expect(drawnStates).toEqual([]);
});

test('help tracks its focus handle only after initialization', () => {
  const view = new loaded.default();
  const handle = {};

  view.render();

  expect(trackedHandles).toEqual([]);

  view.init(undefined, { ...context, focus_handle: () => handle });
  view.render();

  expect(trackedHandles).toEqual([handle]);
});

test('closing help records the overlay close', () => {
  const view = new loaded.default();

  view.close();

  expect(recordedCloses).toBe(1);
});
