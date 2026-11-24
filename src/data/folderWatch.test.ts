import { beforeEach, describe, expect, test } from 'bun:test';

import type { FolderWatch } from 'herdr';

interface Watch {
  folder: string;
  cancelled: boolean;
  resolve: (paths: string[]) => void;
  reject: (reason: Error) => void;
}

interface Listener {
  onChange: () => void;
  onError: () => void;
}

interface HandleLike {
  cancel: () => void;
}

let watches: Watch[] = [];
let changes = 0;
let errors = 0;
let cancelResolves = true;
let failNextWatch = false;

const watchFolder = (folder: string): FolderWatch => {
  if (failNextWatch) {
    failNextWatch = false;

    throw new Error('too many folders');
  }

  const settled = Promise.withResolvers<string[]>();

  const watch: Watch = {
    folder,
    cancelled: false,
    resolve: settled.resolve,
    reject: settled.reject,
  };

  watches.push(watch);

  return Object.assign(settled.promise, {
    cancel: () => {
      watch.cancelled = true;

      if (cancelResolves) {
        settled.resolve([]);
      }
    },
  });
};

const modulePath = './folderWatch.ts';

const loaded = (await import(modulePath)) as {
  watchFolderChanges: (
    watch: (folder: string) => FolderWatch,
    folder: string,
    cx: unknown,
    listener: Listener,
  ) => HandleLike;
};

const spawned: Promise<void>[] = [];

const context = {
  spawn: (body: (cx: unknown) => Promise<void>) => {
    spawned.push(body(context));
  },
};

const settle = async (): Promise<void> => {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
};

const start = (listener?: Listener): HandleLike =>
  loaded.watchFolderChanges(
    watchFolder,
    '/repo',
    context,
    listener ?? {
      onChange: () => {
        changes += 1;
      },
      onError: () => {
        errors += 1;
      },
    },
  );

const latest = (): Watch => {
  const watch = watches.at(-1);

  if (watch === undefined) {
    throw new Error('no folder watch started');
  }

  return watch;
};

beforeEach(() => {
  watches = [];
  changes = 0;
  errors = 0;
  cancelResolves = true;
  failNextWatch = false;
});

describe('watchFolderChanges', () => {
  test('calls back for each batch and watches the folder again', async () => {
    start();

    latest().resolve(['/repo/a']);
    await settle();
    latest().resolve(['/repo/b']);
    await settle();

    expect(changes).toBe(2);
    expect(watches.map((watch) => watch.folder)).toEqual(['/repo', '/repo', '/repo']);
  });

  test('cancel stops the pending watch and the callbacks', async () => {
    const handle = start();

    latest().resolve(['/repo/a']);
    await settle();
    handle.cancel();
    await settle();

    expect(latest().cancelled).toBe(true);
    expect(changes).toBe(1);
    expect(watches).toHaveLength(2);
  });

  test('a cancel inside a change starts no next watch', async () => {
    const handle = start({
      onChange: () => {
        changes += 1;
        handle.cancel();
      },
      onError: () => {
        errors += 1;
      },
    });

    latest().resolve(['/repo/a']);
    await settle();

    expect(changes).toBe(1);
    expect(errors).toBe(0);
    expect(watches).toHaveLength(1);
  });

  test('calls the error callback once when a watch rejects', async () => {
    start();

    latest().reject(new Error('too many folders'));
    await settle();

    expect(errors).toBe(1);
    expect(changes).toBe(0);
    expect(watches).toHaveLength(1);
  });

  test('delivers a change and calls the error callback when the next watch fails', async () => {
    start();
    failNextWatch = true;

    latest().resolve(['/repo/a']);
    await settle();

    expect(changes).toBe(1);
    expect(errors).toBe(1);
    expect(watches).toHaveLength(1);
  });

  test('a rejection after cancel calls nothing', async () => {
    cancelResolves = false;

    const handle = start();

    handle.cancel();
    latest().reject(new Error('late'));
    await settle();

    expect(errors).toBe(0);
    expect(changes).toBe(0);
  });
});
