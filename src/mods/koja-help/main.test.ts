import { afterAll, beforeEach, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

type KeyHandler = (event: { key: string }) => void;

let keyHandler: KeyHandler | undefined;
let changeHandler: (() => void) | undefined;
let query = '';
let closeCalls = 0;
let recordedCloses = 0;
let drawnKeys: string[] = [];
let drawnRows: string[] = [];

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
  },
  focus: () => undefined,
  value: () => query,
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({ InputState: { new: () => input }, v_flex: element }),
);

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
    stateLine: element,
    detailText: element,
    keyHint: (keys: string) => {
      drawnKeys.push(keys);

      return element();
    },
    listRow: (row: { label: string }) => {
      drawnRows.push(row.label);

      return element();
    },
    closeOverlay: () => {
      closeCalls += 1;
    },
    recordOverlayClose: () => {
      recordedCloses += 1;
    },
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
});

afterAll(() => {
  mock.restore();
});

const context = {
  focus_handle: () => ({}),
  timer: { after: () => undefined },
};

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
  expect(drawnRows.length).toBeGreaterThan(0);
  expect(drawnRows.every((name) => name.toLowerCase().includes('space'))).toBe(true);

  keyHandler?.({ key: 'escape' });

  expect(closeCalls).toBe(1);
  expect(recordedCloses).toBe(1);
});

test('closing help records the overlay close', () => {
  const view = new loaded.default();

  view.close();

  expect(recordedCloses).toBe(1);
});
