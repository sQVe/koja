import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';
import type { PreviewHost } from './previewLifecycle.ts';

interface LayoutBlock {
  content?: { props?: Record<string, unknown>; terminal?: string };
  children?: LayoutBlock[];
}

interface OpenedOverlay {
  spec: Record<string, unknown>;
  offset: number;
}

let opened: OpenedOverlay[] = [];
let spawned: Promise<unknown>[] = [];
let closed: (string | null)[] = [];
let ran: string[] = [];

Object.assign(globalThis, { kojaModName: 'koja-picker' });

await mock.module('herdr', () =>
  herdrFake({
    focused: () => null,
    run: (command: string, args: Record<string, unknown>) => {
      ran.push(`${command} ${JSON.stringify(args)}`);

      return null;
    },
  }),
);

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    closeOverlay: (id: string | null) => {
      closed.push(id);

      return null;
    },
    openAtTop: (spec: Record<string, unknown>, offset: number) => {
      opened.push({ spec, offset });

      return 'overlay-9';
    },
    overlayId: () => 'overlay-3',
  }),
);

const launchPath = './launch.ts';

const { launch } = (await import(launchPath)) as unknown as {
  launch: (
    cx: unknown,
    session: unknown,
    rememberPane: (tab: string, pane: string) => void,
    onSettled?: () => void,
  ) => void;
};

const sessionPath = './previewLifecycle.ts';

const { PreviewSession: sessionClass } = (await import(sessionPath)) as unknown as {
  PreviewSession: new (host: PreviewHost) => unknown;
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  opened = [];
  spawned = [];
  closed = [];
  ran = [];
});

const hostWith = (answer: { code: number; stdout: string }): PreviewHost => ({
  script: '/tmp/preview.sh',
  hc: async () => ({ code: answer.code, stdout: answer.stdout, stderr: '' }),
  read: async () => null,
  write: async () => undefined,
  newFolder: async () => '/tmp/koja-picker.test',
  removeFolder: () => undefined,
  kill: () => undefined,
});

const spawnNow = {
  spawn: (body: (cx: unknown) => unknown) => {
    spawned.push(Promise.resolve(body(undefined)));
  },
};

const settle = async (): Promise<void> => {
  await Promise.all(spawned);
};

const layoutOf = (spec: Record<string, unknown>): LayoutBlock => spec['layout'] as LayoutBlock;

const blocksOf = (node: LayoutBlock): LayoutBlock[] => [
  node,
  ...(node.children ?? []).flatMap(blocksOf),
];

const partsOf = (spec: Record<string, unknown>): unknown[] =>
  blocksOf(layoutOf(spec)).flatMap((block) => block.content?.props?.['part'] ?? []);

const listPropsOf = (spec: Record<string, unknown>): Record<string, unknown> =>
  blocksOf(layoutOf(spec)).find((block) => block.content?.props?.['part'] === 'list')?.content
    ?.props ?? {};

const terminalsOf = (spec: Record<string, unknown>): string[] =>
  blocksOf(layoutOf(spec)).flatMap((block) => {
    const terminal = block.content?.terminal;

    return terminal === undefined ? [] : [terminal];
  });

const start = (answer: { code: number; stdout: string }): void => {
  const session = new sessionClass(hostWith(answer));

  launch(
    spawnNow,
    session,
    () => undefined,
    () => undefined,
  );
};

describe('launch', () => {
  test('a preview that cannot start shows the error line and keeps Go to open', async () => {
    start({ code: 1, stdout: '' });
    await settle();

    expect(opened).toHaveLength(1);

    const spec = opened[0]?.spec ?? {};

    expect(partsOf(spec)).toEqual(['list', 'preview-error', 'footer']);
    expect(terminalsOf(spec)).toEqual([]);
    expect(listPropsOf(spec)['preview']).toBeUndefined();
    expect(closed).toEqual(['overlay-3']);
    expect(ran).toEqual([]);
  });

  test('a preview that starts shows the terminal under the preview header', async () => {
    start({ code: 0, stdout: '{"address":"w1:p1"}\n' });
    await settle();

    const spec = opened[0]?.spec ?? {};

    const preview = listPropsOf(spec)['preview'];

    expect(preview).toEqual({
      folder: '/tmp/koja-picker.test',
      state: '/tmp/koja-picker.test/state',
      viewer: 'w1:p1',
    });

    expect(partsOf(spec)).toEqual(['list', 'preview-header', 'footer']);
    expect(terminalsOf(spec)).toEqual(['w1:p1']);
    expect(closed).toEqual(['overlay-3']);
  });
});
