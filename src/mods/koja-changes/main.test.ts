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
  cancelled: boolean;
  resolve: (paths: string[]) => void;
  reject: (reason: Error) => void;
}

interface RenderedList {
  files: { path: string }[];
  open: string | null;
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
  close: () => void;
  render: (cx: unknown) => unknown;
  refresh: (cx: unknown) => void;
}

let cwd = '/repo/a';

let checkingNow = false;

let failStatus = false;

let statusReads = 0;

let statusText = ' M a.ts\0 M b.ts\0';

let blockStatus = false;

let blockAfterReads = 0;

let statusGate: (() => void) | null = null;

let inputValue = '';

let notifications = 0;

let rendering = false;

let timerMilliseconds = 0;

let timerHandler: ((cx: unknown) => void) | null = null;

let renderedList: RenderedList | null = null;

let renderedCommit: RenderedCommit | null = null;

let renderedNote: string | null = null;

let renderedDiff: unknown[] = [];

const commands: string[][] = [];

const watchers: Watch[] = [];

const spawnErrors: unknown[] = [];

let failNextSpawn = false;

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
    if (rendering) {
      throw new Error('cx.notify() is not allowed during the `render` phase');
    }

    notifications += 1;
  },
  focus_handle: () => ({ focus: () => undefined }),
  spawn: (callback: (cx: unknown) => Promise<void>) => {
    if (failNextSpawn) {
      failNextSpawn = false;

      throw new Error('task limit reached');
    }

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
    checking: () => checkingNow,
    focused: () => ({ pane: null, cwd, terminal: null }),
    watchFolder: () => {
      let settle: Pick<Watch, 'resolve' | 'reject'> | null = null;

      const promise = new Promise<string[]>((resolve, reject) => {
        settle = { resolve, reject };
      });

      const watch: Watch = {
        pending: true,
        cancelled: false,
        resolve: (paths) => {
          watch.pending = false;
          settle?.resolve(paths);
        },
        reject: (reason) => {
          watch.pending = false;
          settle?.reject(reason);
        },
      };

      watchers.push(watch);

      return Object.assign(promise, {
        cancel: () => {
          if (watch.pending) {
            watch.cancelled = true;
            watch.resolve([]);
          }
        },
      });
    },
    exec: async (command: string, args: string[]) => {
      commands.push([command, ...args]);

      if (args.includes('--is-bare-repository')) {
        return { code: 0, stdout: 'false\nfalse\n/repo/.git\n/repo/.git\n', stderr: '' };
      }

      if (args.includes('--show-toplevel')) {
        return { code: 0, stdout: '/repo\n', stderr: '' };
      }

      if (args[0] === 'symbolic-ref') {
        return { code: 0, stdout: 'main\n', stderr: '' };
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
  noteRow: (text: string) => {
    renderedNote = text;

    return chainable();
  },
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
  diffArea: (rows: unknown[]) => {
    renderedDiff = rows;

    return chainable();
  },
}));

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  cwd = '/repo/a';
  checkingNow = false;
  failStatus = false;
  statusReads = 0;
  statusText = ' M a.ts\0 M b.ts\0';
  blockStatus = false;
  blockAfterReads = 0;
  statusGate = null;
  inputValue = '';
  notifications = 0;
  rendering = false;
  timerMilliseconds = 0;
  timerHandler = null;
  renderedList = null;
  renderedCommit = null;
  renderedNote = null;
  renderedDiff = [];
  commands.length = 0;
  watchers.length = 0;
  spawnErrors.length = 0;
  failNextSpawn = false;
  inputHandlers.clear();
});

const modulePath = './main.ts';

const loadView = async (): Promise<ChangesView> => {
  const loaded = (await import(modulePath)) as { default: new () => ChangesView };

  const view = new loaded.default();
  const render = view.render.bind(view);

  view.render = (cx) => {
    rendering = true;
    renderedNote = null;

    try {
      return render(cx);
    } finally {
      rendering = false;
    }
  };

  return view;
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
  test('during herdr-app check, init and render run no git and watch no folder', async () => {
    checkingNow = true;

    const view = await boot();

    timerHandler?.(context);
    view.render(context);
    await settle();

    expect(commands).toEqual([]);
    expect(watchers).toEqual([]);
  });

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

  test('a location change seen in render reads the new location and leaves the loading line', async () => {
    const view = await boot();

    cwd = '/repo/b';
    statusText = ' M c.ts\0';
    view.render(context);
    await settle();
    view.render(context);

    expect(renderedList?.line).toBeNull();
    expect(renderedList?.files.map((file) => file.path)).toEqual(['c.ts']);
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

  test('a location change cancels the old watch and reads only the new location', async () => {
    const view = await boot();

    cwd = '/repo/b';
    view.render(context);
    await settle();

    expect(watchers[0]?.cancelled).toBe(true);
    expect(watchers.filter((watch) => watch.pending)).toHaveLength(1);
    expect(statusReads).toBe(4);
  });

  test('closing the view cancels its watch and starts no read', async () => {
    const view = await boot();
    const readsBeforeClose = statusReads;

    view.close();
    await settle();

    expect(watchers[0]?.cancelled).toBe(true);
    expect(watchers).toHaveLength(1);
    expect(statusReads).toBe(readsBeforeClose);
  });

  test('a folder switch during a blocked read cancels the old watch before the read ends', async () => {
    const view = await boot();

    blockStatus = true;
    view.refresh(context);
    await settle();

    cwd = '/repo/b';
    view.render(context);
    await settle();

    expect(watchers[0]?.cancelled).toBe(true);
    expect(watchers.filter((watch) => watch.pending)).toHaveLength(0);

    blockStatus = false;
    statusGate?.();
    await settle();
  });

  test('a read that ends back on the first folder after a brief switch watches it again', async () => {
    const view = await boot();

    blockStatus = true;
    view.refresh(context);
    await settle();

    cwd = '/repo/b';
    view.render(context);
    await settle();

    cwd = '/repo/a';
    blockStatus = false;
    statusGate?.();
    await settle();
    view.render(context);

    expect(watchers[0]?.cancelled).toBe(true);
    expect(watchers.filter((watch) => watch.pending)).toHaveLength(1);
    expect(renderedList?.watchLine).toBeNull();
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

  test('a watch event whose read cannot start marks the read failed until a read succeeds', async () => {
    const view = await boot();

    typeMessage();
    view.render(context);

    expect(renderedCommit?.enabled).toBe(true);

    const before = commitCommands();

    failNextSpawn = true;
    watchers[0]?.resolve(['/repo/a.ts']);
    await settle();
    view.render(context);

    expect(renderedList?.line?.kind).toBe('error');
    expect(renderedList?.watchLine).toBeNull();
    expect(renderedCommit?.enabled).toBe(false);

    renderedCommit?.onCommit(context);
    await settle();

    expect(commitCommands()).toBe(before);

    view.refresh(context);
    await settle();
    view.render(context);

    expect(renderedList?.line).toBeNull();
    expect(renderedCommit?.enabled).toBe(true);
  });

  test('a commit whose task cannot start clears busy and keeps Commit available', async () => {
    const view = await boot();

    typeMessage();
    view.render(context);

    const before = statusReads;
    const commits = commitCommands();

    failNextSpawn = true;
    renderedCommit?.onCommit(context);
    await settle();
    view.render(context);

    expect(renderedNote).toContain('Commit failed');
    expect(commitCommands()).toBe(commits);
    expect(inputValue).toBe('Review fixture');
    expect(renderedCommit?.enabled).toBe(true);

    view.refresh(context);
    await settle();

    expect(statusReads).toBeGreaterThan(before);
  });

  test('a file pick whose task cannot start keeps the open file and its diff', async () => {
    const view = await boot();

    const paths = (renderedList?.files ?? []).map((file) => file.path);
    const open = renderedList?.open ?? null;
    const diff = renderedDiff;

    failNextSpawn = true;
    renderedList?.onPick('b.ts', context);
    await settle();
    view.render(context);

    expect(renderedNote).toBe('Cannot preview this diff: task limit reached');
    expect((renderedList?.files ?? []).map((file) => file.path)).toEqual(paths);
    expect(renderedList?.open).toBe(open);
    expect(renderedDiff).toEqual(diff);
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
