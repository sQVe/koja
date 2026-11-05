import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import {
  chainable,
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../tests/moduleFakes.ts';

interface Watch {
  pending: boolean;
  resolve: (paths: string[]) => void;
  reject: (reason: Error) => void;
}

interface RenderedList {
  files: { path: string }[];
  line: { kind: string; text: string } | null;
  watchLine: { kind: string; text: string } | null;
  onRetry: (cx: unknown) => void;
  onRetryWatch: (cx: unknown) => void;
  onPick: (path: string, cx: unknown) => void;
}

interface RenderedCommit {
  enabled: boolean;
  onCommit: (cx: unknown) => void;
}

interface ChangesView {
  init: (props: unknown, cx: unknown) => void;
  render: (cx: unknown) => unknown;
  refresh: (cx: unknown) => void;
}

let cwd = '/repo/a';

let failStatus = false;

let statusReads = 0;

let statusText = ' M a.ts\0 M b.ts\0';

let blockStatus = false;

let blockAfterReads = 0;

let statusGate: (() => void) | null = null;

let inputValue = '';

let notifications = 0;

let timerMilliseconds = 0;

let timerHandler: ((cx: unknown) => void) | null = null;

let renderedList: RenderedList | null = null;

let renderedCommit: RenderedCommit | null = null;

const commands: string[][] = [];

const watchers: Watch[] = [];

const spawnErrors: unknown[] = [];

const inputHandlers = new Map<string, (event: unknown, cx: unknown) => void>();

const input = {
  on: (name: string, handler: (event: unknown, cx: unknown) => void) => {
    inputHandlers.set(name, handler);
  },
  value: () => inputValue,
  set_value: (next: string) => {
    inputValue = next;
  },
};

const context = {
  notify: () => {
    notifications += 1;
  },
  focus_handle: () => ({ focus: () => undefined }),
  spawn: (callback: (cx: unknown) => Promise<void>) => {
    void callback(context).catch((error: unknown) => {
      spawnErrors.push(error);
    });
  },
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    InputState: { new: () => input },
    v_flex: chainable,
  }),
);

await mock.module('gpui-kit', () => gpuiKitFake());

await mock.module('herdr', () =>
  herdrFake({
    focused: () => ({ pane: null, cwd, terminal: null }),
    watchFolder: () =>
      new Promise<string[]>((resolve, reject) => {
        const watch: Watch = {
          pending: true,
          resolve: (paths) => {
            watch.pending = false;
            resolve(paths);
          },
          reject: (reason) => {
            watch.pending = false;
            reject(reason);
          },
        };

        watchers.push(watch);
      }),
    exec: async (command: string, args: string[]) => {
      commands.push([command, ...args]);

      if (args[0] === 'rev-parse') {
        return { code: 0, stdout: '/repo\n', stderr: '' };
      }

      if (args.includes('status')) {
        statusReads += 1;

        const text = statusText;

        if (blockStatus && statusReads > blockAfterReads) {
          await new Promise<void>((resolve) => {
            statusGate = resolve;
          });
        }

        return failStatus
          ? { code: 128, stdout: '', stderr: 'status unavailable' }
          : { code: 0, stdout: text, stderr: '' };
      }

      if (args.includes('--numstat')) {
        return { code: 0, stdout: '1\t0\ta.ts\0', stderr: '' };
      }

      if (args.includes('diff')) {
        return { code: 0, stdout: '@@ -1 +1 @@\n-old\n+new', stderr: '' };
      }

      return { code: 0, stdout: '', stderr: '' };
    },
  }),
);

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    colors: () => ({}),
    diffSize: { minimumWidth: 300, characterWidth: 7, widthPadding: 50 },
    withTextRole: (element: unknown) => element,
    repeat: (_context: unknown, milliseconds: number, handler: (cx: unknown) => void) => {
      timerMilliseconds = milliseconds;
      timerHandler = handler;
    },
  }),
);

await mock.module('./rows.ts', () => ({
  headerRow: chainable,
  limitedNotice: chainable,
  noteRow: chainable,
  fileList: (options: RenderedList) => {
    renderedList = options;

    return chainable();
  },
  commitBar: (
    _input: unknown,
    _typing: boolean,
    _busy: boolean,
    enabled: boolean,
    _palette: unknown,
    onCommit: (cx: unknown) => void,
  ) => {
    renderedCommit = { enabled, onCommit };

    return chainable();
  },
  diffArea: chainable,
}));

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  cwd = '/repo/a';
  failStatus = false;
  statusReads = 0;
  statusText = ' M a.ts\0 M b.ts\0';
  blockStatus = false;
  blockAfterReads = 0;
  statusGate = null;
  inputValue = '';
  notifications = 0;
  timerMilliseconds = 0;
  timerHandler = null;
  renderedList = null;
  renderedCommit = null;
  commands.length = 0;
  watchers.length = 0;
  spawnErrors.length = 0;
  inputHandlers.clear();
});

const modulePath = './main.ts';

const loadView = async (): Promise<ChangesView> => {
  const loaded = (await import(modulePath)) as { default: new () => ChangesView };

  return new loaded.default();
};

const settle = async (): Promise<void> => {
  for (let index = 0; index < 100; index += 1) {
    await Promise.resolve();
  }

  expect(spawnErrors).toEqual([]);
};

const boot = async (): Promise<ChangesView> => {
  const view = await loadView();

  view.init(null, context);
  await settle();
  view.render(context);

  return view;
};

const typeMessage = (): void => {
  inputValue = 'Review fixture';
  inputHandlers.get('change')?.({}, context);
};

const commitCommands = (): number => commands.filter((args) => args.includes('commit')).length;

describe('Changes view', () => {
  test('a failed refresh keeps the files, shows the stale line, and blocks Commit and Enter', async () => {
    const view = await boot();

    typeMessage();
    view.render(context);

    expect(renderedCommit?.enabled).toBe(true);
    expect(renderedList?.files).toHaveLength(2);

    failStatus = true;
    view.refresh(context);
    await settle();
    view.render(context);

    expect(renderedList?.files).toHaveLength(2);
    expect(renderedList?.line?.kind).toBe('error');

    expect(renderedList?.line?.text).toMatch(
      /^Showing changes from .*\. Could not refresh repo\.$/,
    );

    expect(renderedCommit?.enabled).toBe(false);

    const before = commitCommands();

    renderedCommit?.onCommit(context);
    inputHandlers.get('submit')?.({}, context);
    await settle();

    expect(commitCommands()).toBe(before);
  });

  test('a later good read for the same repository enables Commit again', async () => {
    const view = await boot();

    typeMessage();

    failStatus = true;
    view.refresh(context);
    await settle();
    view.render(context);

    expect(renderedCommit?.enabled).toBe(false);

    failStatus = false;
    view.refresh(context);
    await settle();
    view.render(context);

    expect(renderedCommit?.enabled).toBe(true);
  });

  test('a failed watch shows its error line and Retry starts a new watch', async () => {
    const view = await boot();

    typeMessage();
    watchers[0]?.reject(new Error('watch unavailable'));
    await settle();
    view.render(context);

    expect(renderedList?.watchLine?.kind).toBe('error');
    expect(renderedCommit?.enabled).toBe(true);

    const watchesAtFailure = watchers.length;

    view.refresh(context);
    await settle();

    expect(watchers).toHaveLength(watchesAtFailure);

    renderedList?.onRetryWatch(context);
    await settle();

    expect(watchers).toHaveLength(watchesAtFailure + 1);
  });

  test('watch Retry runs a new status read that shows a file changed while the watch was down', async () => {
    const view = await boot();

    typeMessage();
    watchers[0]?.reject(new Error('watch unavailable'));
    await settle();
    view.render(context);

    expect(renderedList?.watchLine?.kind).toBe('error');

    statusText = ' M a.ts\0?? hidden.ts\0';
    blockStatus = true;
    blockAfterReads = 2;
    const readsBeforeRetry = statusReads;

    renderedList?.onRetryWatch(context);
    await settle();
    view.render(context);

    expect(statusReads).toBe(readsBeforeRetry + 1);
    expect(renderedCommit?.enabled).toBe(false);

    blockStatus = false;
    statusGate?.();
    await settle();
    view.render(context);

    expect(statusReads).toBe(readsBeforeRetry + 1);
    expect(renderedList?.files.map((file) => file.path)).toEqual(['a.ts', 'hidden.ts']);
    expect(renderedCommit?.enabled).toBe(true);
  });

  test('a location change within one repository leaves one active watch loop', async () => {
    const view = await boot();

    expect(watchers).toHaveLength(1);

    cwd = '/repo/b';
    view.render(context);
    await settle();

    expect(watchers).toHaveLength(2);

    watchers[0]?.resolve(['/repo/a.ts']);
    await settle();

    expect(watchers).toHaveLength(2);
    expect(watchers.filter((watch) => watch.pending)).toHaveLength(1);
  });

  test('a watch rejected while focus was briefly elsewhere shows the watch error line', async () => {
    const view = await boot();

    blockStatus = true;
    view.refresh(context);
    await settle();

    cwd = '/repo/b';
    view.render(context);
    await settle();

    watchers[0]?.reject(new Error('watch unavailable'));
    await settle();

    cwd = '/repo/a';
    blockStatus = false;
    statusGate?.();
    await settle();
    view.render(context);

    expect(renderedList?.watchLine?.kind).toBe('error');
  });

  test('an event on the current watch runs a new status read and shows the changed files', async () => {
    const view = await boot();

    expect(statusReads).toBe(2);

    statusText = ' M a.ts\0?? b.ts\0';
    watchers[0]?.resolve(['/repo/b.ts']);
    await settle();
    view.render(context);

    expect(statusReads).toBe(3);
    expect(renderedList?.files.map((file) => file.path)).toEqual(['a.ts', 'b.ts']);
  });

  test('a watch event during a loading read causes a second status read without enabling Commit', async () => {
    const view = await boot();

    typeMessage();
    view.render(context);

    expect(renderedCommit?.enabled).toBe(true);

    statusText = ' M a.ts\0';
    blockStatus = true;
    view.refresh(context);
    await settle();

    watchers[0]?.resolve([]);
    await settle();
    view.render(context);

    expect(renderedCommit?.enabled).toBe(false);

    statusText = ' M a.ts\0?? b.ts\0';
    blockStatus = false;
    statusGate?.();
    await settle();
    view.render(context);

    expect(statusReads).toBe(4);
    expect(renderedList?.files.map((file) => file.path)).toEqual(['a.ts', 'b.ts']);
    expect(renderedCommit?.enabled).toBe(true);
  });

  test('the first good read starts one more read after the watch and keeps Commit off until it ends', async () => {
    blockStatus = true;
    blockAfterReads = 1;

    const view = await loadView();

    view.init(null, context);
    typeMessage();
    await settle();
    view.render(context);

    expect(statusReads).toBe(2);
    expect(watchers).toHaveLength(1);
    expect(renderedCommit?.enabled).toBe(false);

    blockStatus = false;
    statusGate?.();
    await settle();
    view.render(context);

    expect(statusReads).toBe(2);
    expect(renderedCommit?.enabled).toBe(true);
  });

  test('timer ticks during a slow read start no extra read and Commit turns on after it', async () => {
    const view = await boot();

    typeMessage();
    view.render(context);

    expect(renderedCommit?.enabled).toBe(true);
    expect(timerMilliseconds).toBe(10000);

    blockStatus = true;
    timerHandler?.(context);
    await settle();

    for (let index = 0; index < 3; index += 1) {
      timerHandler?.(context);
      await settle();
    }

    blockStatus = false;
    statusGate?.();
    await settle();
    view.render(context);

    expect(statusReads).toBe(3);
    expect(renderedCommit?.enabled).toBe(true);
  });

  test('a background refresh requests a redraw before its read finishes', async () => {
    await boot();

    const before = notifications;

    blockStatus = true;
    timerHandler?.(context);
    await settle();

    expect(notifications).toBeGreaterThan(before);
    expect(statusGate).not.toBeNull();

    blockStatus = false;
    statusGate?.();
    await settle();
  });
});
