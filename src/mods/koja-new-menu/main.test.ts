import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  click,
  clickablesWithText,
  drawn,
  drawnTexts,
  elementsWithStyle,
} from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { placeOf, repositoryOf, worktreeOf } from '../../data/gitIdentity.ts';
import { emptyFacts, snapshotKey } from '../../data/snapshot.ts';
import { newMenuOpenKey } from '../../kit/newMenu.ts';
import { knownAgentsKey } from './agents.ts';

Object.assign(globalThis, { kojaModName: 'koja-new-menu' });

let checkingNow = false;

let agentLookups = 0;

let agentReply: () => Promise<unknown[]> = async () => [];

let tasks: Promise<void>[] = [];

let sharedValues: Record<string, unknown> = {};

let runCalls: { command: string; args: Record<string, unknown> | undefined }[] = [];

let closedOverlays: string[] = [];

let openedOverlays: Record<string, unknown>[] = [];

let spaceList: unknown[] = [];

const folder = '/code/koja/me-1191';

const space = { id: 'space-1', machine: null, folder, active: true, tabs: [] };

const selectedFill = '#b9bdc6';

const agentOf = (name: string, installed: boolean): unknown => ({
  key: name.toLowerCase(),
  name,
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: false,
  agent: true,
  run: [name],
  installed,
});

const snapshotFor = (commonDirectory: string): unknown => {
  const place = placeOf(null, folder);
  const worktree = worktreeOf(null, folder);

  const facts = {
    ...emptyFacts(),
    git: {
      places: { [place.key]: { kind: 'repository', worktree: worktree.key } },
      worktrees: {
        [worktree.key]: {
          repository: repositoryOf(null, commonDirectory),
          root: folder,
          branch: 'main',
          linked: true,
          bare: false,
        },
      },
    },
  };

  return { version: 8, revision: 1, facts };
};

const context = {
  focus_handle: () => ({ focus: () => undefined }),
  notify: () => undefined,
  stop_propagation: () => undefined,
  spawn: (body: (cx: unknown) => Promise<void>) => {
    tasks.push(body(context));
  },
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () =>
  herdrFake({
    checking: () => checkingNow,
    closeOverlay: (id: string) => {
      closedOverlays.push(id);

      return null;
    },
    knownAgents: async () => {
      agentLookups += 1;

      return agentReply();
    },
    openOverlay: (spec: Record<string, unknown>) => {
      openedOverlays.push(spec);

      return 'overlay-1';
    },
    panes: () => [{ pane: 'pane-1', cwd: folder, focused: true }],
    props: () => ({ overlay: 'overlay-1' }),
    run: (command: string, args?: Record<string, unknown>) => {
      runCalls.push({ command, args });

      return null;
    },
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;

      return null;
    },
    shared: (key: string) => sharedValues[key],
    spaces: () => spaceList,
    theme: () => ({ selected: selectedFill, border: '#959aa4', popover: '#e6e8eb' }),
  }),
);

const kitParts = [
  'binding',
  'button',
  'newMenu',
  'hover',
  'icon',
  'keycap',
  'listRow',
  'normalKeys',
  'normalRun',
  'overlay/card',
  'overlay/overlay',
  'popupSurface',
  'shortcut',
  'size',
  'stateLine',
  'text',
  'textRole',
  'theme',
  'window',
  'worktree',
];

const kitFake = await realKitIndexFake(kitParts);

await mock.module('../../kit/index.ts', () => kitFake);

const modulePath = './main.ts';

const loaded = (await import(modulePath)) as {
  default: new () => {
    init: (props: unknown, cx: unknown) => void;
    render: () => DrawnElement;
    close: () => void;
  };
};

const openBeforeCheck = (): InstanceType<typeof loaded.default> => {
  const view = new loaded.default();

  view.init(null, context);

  return view;
};

const openMenu = async (): Promise<InstanceType<typeof loaded.default>> => {
  const view = openBeforeCheck();

  await Promise.all(tasks);

  return view;
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  checkingNow = false;
  agentLookups = 0;
  agentReply = async () => [];
  tasks = [];
  sharedValues = {};
  runCalls = [];
  closedOverlays = [];
  openedOverlays = [];
  spaceList = [space];
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

  test('shows its empty line when no agent is installed', async () => {
    const view = await openMenu();

    expect(drawnTexts(view.render())).toContain('No agents installed');
  });

  test('shows the error line with Retry when the lookup fails', async () => {
    agentReply = async () => {
      throw new Error('the shell did not answer');
    };

    const view = await openMenu();
    const tree = view.render();

    expect(drawnTexts(tree)).toContain('Could not check installed agents');
    expect(clickablesWithText(tree, 'Retry')).toHaveLength(1);
  });

  test('reads the agents again when Retry is clicked', async () => {
    agentReply = async () => {
      throw new Error('the shell did not answer');
    };

    const view = await openMenu();
    const [retry] = clickablesWithText(view.render(), 'Retry');

    agentReply = async () => [agentOf('Pi', true)];

    retry?.clickHandlers[0]?.({}, context);

    await Promise.all(tasks);

    const tree = view.render();

    expect(agentLookups).toBe(2);
    expect(drawnTexts(tree)).toContain('Pi');
    expect(drawnTexts(tree)).not.toContain('Could not check installed agents');
  });

  test('opens with the agents the last check found, before checking again', async () => {
    agentReply = async () => [agentOf('Pi', true)];

    await openMenu();

    const answered: ((agents: unknown[]) => void)[] = [];

    agentReply = () =>
      new Promise<unknown[]>((resolve) => {
        answered.push(resolve);
      });

    const reopened = openBeforeCheck();
    const texts = drawnTexts(reopened.render());

    expect(texts).toContain('Pi');
    expect(texts).not.toContain('Checking installed agents…');

    answered[0]?.([]);

    await Promise.all(tasks);
  });

  test('keeps the agents of the last check when the check fails', async () => {
    sharedValues[knownAgentsKey] = { '': [agentOf('Pi', true)] };

    agentReply = async () => {
      throw new Error('the shell did not answer');
    };

    const view = await openMenu();
    const tree = view.render();

    expect(drawnTexts(tree)).toContain('Pi');
    expect(drawnTexts(tree)).toContain('Could not check installed agents');
  });

  test('lists only the agents that are installed', async () => {
    agentReply = async () => [agentOf('Pi', true), agentOf('Claude Code', false)];

    const view = await openMenu();
    const texts = drawnTexts(view.render());

    expect(texts).toContain('Pi');
    expect(texts).not.toContain('Claude Code');
    expect(texts).not.toContain('No agents installed');
  });

  test('starts an agent in the space the menu opened on', async () => {
    agentReply = async () => [agentOf('Pi', true)];

    const view = await openMenu();
    const [row] = clickablesWithText(view.render(), 'Pi');

    if (row !== undefined) {
      click(row);
    }

    expect(runCalls).toEqual([
      { command: 'tab.new', args: { name: 'Pi', space: 'space-1', argv: ['Pi'] } },
    ]);
  });

  test('starts a terminal in the space the menu opened on', async () => {
    const view = await openMenu();
    const [row] = clickablesWithText(view.render(), 'Terminal');

    if (row !== undefined) {
      click(row);
    }

    expect(closedOverlays).toEqual(['overlay-1']);
    expect(runCalls).toEqual([{ command: 'tab.new', args: { space: 'space-1' } }]);
  });

  test('hints the normal-mode keys in normal mode and none in insert mode', async () => {
    sharedValues['koja-modal'] = true;

    const normal = await openMenu();
    const normalTexts = drawnTexts(normal.render());

    sharedValues = {};

    const insert = await openMenu();
    const insertTexts = drawnTexts(insert.render());

    expect(normalTexts).toContain('t');
    expect(normalTexts).toContain('s');
    expect(insertTexts).not.toContain('t');
    expect(insertTexts).not.toContain('s');
  });

  test('names the repository its worktree rows work from', async () => {
    sharedValues[snapshotKey] = snapshotFor('/code/koja/.git');

    const view = await openMenu();
    const texts = drawnTexts(view.render());

    expect(texts).toContain('From a new worktree of koja…');
    expect(texts).toContain('From an existing worktree of koja…');
  });

  test('opens with its Terminal row selected, as the scene draws it', async () => {
    const view = await openMenu();
    const tree = view.render();

    expect(clickablesWithText(tree, 'Terminal')[0]?.backgroundColors).toContain(selectedFill);

    expect(clickablesWithText(tree, 'Empty space')[0]?.backgroundColors).not.toContain(
      selectedFill,
    );
  });

  test('marks the menu open while it shows and closed when it closes', async () => {
    const view = await openMenu();

    expect(sharedValues[newMenuOpenKey]).toBe(true);

    view.close();

    expect(sharedValues[newMenuOpenKey]).toBe(false);
  });

  test('keeps every agent of a long list reachable', async () => {
    const many = Array.from({ length: 20 }, (_unused, index) => agentOf(`Agent ${index}`, true));

    agentReply = async () => many;

    const view = await openMenu();
    const tree = view.render();
    const texts = drawnTexts(tree);

    expect(texts).toContain('Agent 19');
    expect(elementsWithStyle(tree, 'overflow_y_scrollbar')).toHaveLength(1);
  });

  test('starts one lookup when Retry is clicked twice', async () => {
    agentReply = async () => {
      throw new Error('the shell did not answer');
    };

    const view = await openMenu();
    const [retry] = clickablesWithText(view.render(), 'Retry');
    const answered: ((agents: unknown[]) => void)[] = [];

    agentReply = () =>
      new Promise<unknown[]>((resolve) => {
        answered.push(resolve);
      });

    retry?.clickHandlers[0]?.({}, context);
    retry?.clickHandlers[0]?.({}, context);

    expect(agentLookups).toBe(2);

    answered[0]?.([agentOf('Pi', true)]);

    await Promise.all(tasks);

    expect(drawnTexts(view.render())).toContain('Pi');
  });

  test('leaves the worktree rows disabled when the menu has no space', async () => {
    spaceList = [];

    const view = await openMenu();
    const [row] = clickablesWithText(view.render(), 'From a new worktree…');

    expect(row).toBeDefined();

    if (row !== undefined) {
      click(row);
    }

    expect(openedOverlays).toEqual([]);
  });

  test('names no repository when the data layer has not read the folder', async () => {
    const view = await openMenu();
    const texts = drawnTexts(view.render());

    expect(texts).toContain('From a new worktree…');
  });
});
