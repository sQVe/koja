import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

let checkingNow = false;

let execCalls: string[][] = [];

let tasks: Promise<void>[] = [];

const context = {
  focus_handle: () => ({ focus: () => undefined }),
  notify: () => undefined,
  spawn: (body: (cx: unknown) => Promise<void>) => {
    tasks.push(body(context));
  },
};

await mock.module('gpui-base', () => gpuiBaseFake());

await mock.module('gpui-kit', () => gpuiKitFake());

await mock.module('herdr', () =>
  herdrFake({
    checking: () => checkingNow,
    exec: async (command: string, args: string[]) => {
      execCalls.push([command, ...args]);

      return { code: 128, stdout: '', stderr: 'fatal: not a git repository' };
    },
    props: () => ({ tab: 'space', target: { id: 'space-1' } }),
    spaces: () => [{ id: 'space-1', folder: '/code/koja', machine: null, tabs: [] }],
  }),
);

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    spaceFolder: (space: { folder: string }) => space.folder,
  }),
);

const modulePath = './main.ts';

const loaded = (await import(modulePath)) as {
  default: new () => { init: (props: unknown, cx: unknown) => void };
};

const openMenu = async (): Promise<void> => {
  new loaded.default().init(null, context);
  await Promise.all(tasks);
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  checkingNow = false;
  execCalls = [];
  tasks = [];
});

describe('space menu', () => {
  test('opening a space menu reads the git checkout of its folder', async () => {
    await openMenu();

    expect(execCalls.length).toBeGreaterThan(0);
    expect(execCalls.every((call) => call[0] === 'git')).toBe(true);
  });

  test('during herdr-app check, opening a space menu runs no git', async () => {
    checkingNow = true;

    await openMenu();

    expect(execCalls).toEqual([]);
  });
});
