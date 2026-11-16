import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

let checkingNow = false;

let agentLookups = 0;

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
    knownAgents: async () => {
      agentLookups += 1;

      return [];
    },
  }),
);

await mock.module('../../kit/index.ts', () => kitIndexFake());

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
  agentLookups = 0;
  tasks = [];
});

describe('new menu', () => {
  test('opening the menu asks which agents are installed', async () => {
    await openMenu();

    expect(agentLookups).toBe(1);
  });

  test('during herdr-app check, opening the menu starts no shell to look for agents', async () => {
    checkingNow = true;

    await openMenu();

    expect(agentLookups).toBe(0);
  });
});
