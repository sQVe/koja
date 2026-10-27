import { expect, it, onTestFinished } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId, TabId } from '../ids.ts';
import type { SavedSession, Tab, Workspace } from '../store/store.ts';
import type { Log } from './log.ts';
import { readSessionFile, sessionPathFor } from './sessionFile.ts';
import { createSessionWriter } from './sessionWriter.ts';

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-session-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return directory;
};

const sessionWith = (overrides: Partial<SavedSession> = {}): SavedSession => ({
  workspaces: [
    {
      id: workspaceId(1),
      root: '/work/one',
      label: 'one',
      tabIds: [tabId(1)],
      activeTabId: tabId(1),
    },
    {
      id: workspaceId(2),
      root: '/work/two',
      label: 'two',
      tabIds: [tabId(2)],
      activeTabId: tabId(2),
    },
  ],
  tabs: [
    {
      id: tabId(1),
      workspaceId: workspaceId(1),
      layout: {
        kind: 'split',
        direction: 'right',
        ratio: 0.5,
        first: { kind: 'pane', paneId: paneId(1) },
        second: { kind: 'pane', paneId: paneId(2) },
      },
      arrangement: { choice: 'legacy', order: [paneId(1), paneId(2)] },
      focusedPaneId: paneId(1),
      zoomedPaneId: paneId(2),
      label: undefined,
    },
    {
      id: tabId(2),
      workspaceId: workspaceId(2),
      layout: { kind: 'pane', paneId: paneId(3) },
      arrangement: { choice: 'legacy', order: [paneId(3)] },
      focusedPaneId: paneId(3),
      zoomedPaneId: undefined,
      label: undefined,
    },
  ],
  panes: [
    { id: paneId(1), tabId: tabId(1), startFolder: undefined },
    { id: paneId(2), tabId: tabId(1), startFolder: undefined },
    { id: paneId(3), tabId: tabId(2), startFolder: undefined },
  ],
  focusedWorkspaceId: workspaceId(2),
  nextWorkspaceNumber: 3,
  nextTabNumber: 3,
  nextPaneNumber: 4,
  ...overrides,
});

const ignore = (): void => {};

const tabWith =
  (changes: Partial<Tab>) =>
  (tab: Tab): Tab => ({ ...tab, ...changes });

const workspaceWith =
  (changes: Partial<Workspace>) =>
  (workspace: Workspace): Workspace => ({ ...workspace, ...changes });

const recordingLog = (): { log: Log; errors: string[] } => {
  const errors: string[] = [];

  return {
    log: {
      debug: ignore,
      info: ignore,
      warn: ignore,
      error: (message) => {
        errors.push(message);
      },
    },
    errors,
  };
};

const writeSession = async (path: string, session: unknown, version = 1): Promise<void> => {
  await writeFile(path, JSON.stringify({ version, session }));
};

const savedJson = async (session: SavedSession): Promise<unknown> =>
  JSON.parse(JSON.stringify(session, (_key, value: unknown) => value ?? null));

const expectBroken = async (path: string): Promise<void> => {
  const result = await readSessionFile(path);

  expect(result.kind).toBe('broken');
};

it('reads back the session it saved', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'sessions', 'session.json');
  const session = sessionWith();
  const writer = createSessionWriter(path, recordingLog().log);

  writer.save(session);
  await writer.stopSaving(session);

  expect(await readSessionFile(path)).toEqual({ kind: 'restored', session });
});

it('reads back the label of a tab', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const session = sessionWith({ tabs: sessionWith().tabs.map(tabWith({ label: 'build' })) });
  const writer = createSessionWriter(path, recordingLog().log);

  await writer.stopSaving(session);

  expect(await readSessionFile(path)).toEqual({ kind: 'restored', session });
});

it('reads a session file saved before tabs had labels', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const session = sessionWith();

  const saved = structuredClone(await savedJson(session)) as {
    tabs: Record<string, unknown>[];
  };

  for (const tab of saved.tabs) {
    delete tab['label'];
  }

  await writeSession(path, saved);

  expect(await readSessionFile(path)).toEqual({ kind: 'restored', session });
});

it('reads back a session with no workspaces', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');

  const session = sessionWith({
    workspaces: [],
    tabs: [],
    panes: [],
    focusedWorkspaceId: undefined,
  });

  const writer = createSessionWriter(path, recordingLog().log);

  await writer.stopSaving(session);

  expect(await readSessionFile(path)).toEqual({ kind: 'restored', session });
});

it('reads back the folder of a pane and a pane with no folder', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const base = sessionWith();

  const session = sessionWith({
    panes: [{ ...base.panes[0]!, startFolder: '/work/one' }, ...base.panes.slice(1)],
  });

  await createSessionWriter(path, recordingLog().log).stopSaving(session);

  const result = await readSessionFile(path);

  expect(result).toEqual({ kind: 'restored', session });

  expect(
    result.kind === 'restored' && result.session.panes.map((pane) => pane.startFolder),
  ).toEqual(['/work/one', undefined, undefined]);
});

it('restores a version 1 file whose panes have no folder', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const session = sessionWith();
  const saved = (await savedJson(session)) as { panes: Record<string, unknown>[] };

  for (const pane of saved.panes) {
    delete pane.startFolder;
  }

  await writeSession(path, saved);

  expect(await readSessionFile(path)).toEqual({ kind: 'restored', session });
});

it('restores a version 1 file with no arrangement as legacy in tree order', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');

  const layout = {
    kind: 'split',
    direction: 'right',
    ratio: 0.3,
    first: { kind: 'pane', paneId: 'pane-2' },
    second: {
      kind: 'split',
      direction: 'below',
      ratio: 0.7,
      first: { kind: 'pane', paneId: 'pane-3' },
      second: { kind: 'pane', paneId: 'pane-1' },
    },
  };

  await writeSession(path, {
    workspaces: [
      { id: 'workspace-1', root: '/work', label: 'work', tabIds: ['tab-1'], activeTabId: 'tab-1' },
    ],
    tabs: [
      {
        id: 'tab-1',
        workspaceId: 'workspace-1',
        layout,
        focusedPaneId: 'pane-3',
        zoomedPaneId: 'pane-1',
        label: null,
      },
    ],
    panes: [
      { id: 'pane-1', tabId: 'tab-1', startFolder: null },
      { id: 'pane-2', tabId: 'tab-1', startFolder: null },
      { id: 'pane-3', tabId: 'tab-1', startFolder: null },
    ],
    focusedWorkspaceId: 'workspace-1',
    nextWorkspaceNumber: 2,
    nextTabNumber: 2,
    nextPaneNumber: 4,
  });

  const result = await readSessionFile(path);
  const tab = result.kind === 'restored' ? result.session.tabs[0] : undefined;

  expect(tab).toEqual({
    id: tabId(1),
    workspaceId: workspaceId(1),
    layout: layout as Tab['layout'],
    arrangement: { choice: 'legacy', order: [paneId(2), paneId(3), paneId(1)] },
    focusedPaneId: paneId(3),
    zoomedPaneId: paneId(1),
    label: undefined,
  });
});

it('reads back a legacy tab and a master tab whose order differs from tree order', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const base = sessionWith();

  const session = sessionWith({
    tabs: [
      { ...base.tabs[0]!, arrangement: { choice: 'master', order: [paneId(2), paneId(1)] } },
      base.tabs[1]!,
    ],
  });

  await createSessionWriter(path, recordingLog().log).stopSaving(session);

  expect(await readSessionFile(path)).toEqual({ kind: 'restored', session });
});

const badArrangements: [string, unknown][] = [
  ['an unknown layout choice', { choice: 'grid', order: ['pane-1', 'pane-2'] }],
  ['a pane listed twice', { choice: 'legacy', order: ['pane-1', 'pane-2', 'pane-1'] }],
  ['a missing pane', { choice: 'master', order: ['pane-1'] }],
  ['a pane from another layout', { choice: 'master', order: ['pane-1', 'pane-2', 'pane-3'] }],
];

it.each(badArrangements)('reports an arrangement with %s as broken', async (_name, arrangement) => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const saved = (await savedJson(sessionWith())) as { tabs: Record<string, unknown>[] };

  saved.tabs[0]!['arrangement'] = arrangement;
  await writeSession(path, saved);

  await expectBroken(path);
});

it('reports a missing file', async () => {
  const directory = await temporaryDirectory();

  expect(await readSessionFile(join(directory, 'none.json'))).toEqual({ kind: 'missing' });
});

it('reports invalid JSON as broken', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  await writeFile(path, '{ not json');

  await expectBroken(path);
});

it('reports a file that fails the schema as broken', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  await writeSession(path, { workspaces: 'none' });

  await expectBroken(path);
});

it('reports an unreadable path as broken', async () => {
  const directory = await temporaryDirectory();

  await expectBroken(directory);
});

it('reports a file from a newer version', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  await writeSession(path, { future: true }, 2);

  expect(await readSessionFile(path)).toEqual({ kind: 'newer', version: 2 });
});

const disagreeing: [string, Partial<SavedSession>][] = [
  ['a missing focused workspace', { focusedWorkspaceId: undefined }],
  ['an unknown focused workspace', { focusedWorkspaceId: workspaceId(9) }],
  [
    'a pane in no layout',
    { panes: [...sessionWith().panes, { id: paneId(4), tabId: tabId(2), startFolder: undefined }] },
  ],
  ['a pane missing from the list', { panes: sessionWith().panes.slice(1) }],
  [
    'a duplicate pane',
    { panes: [...sessionWith().panes, { id: paneId(3), tabId: tabId(2), startFolder: undefined }] },
  ],
  ['a counter at an existing id', { nextPaneNumber: 3 }],
  [
    'a tab with no workspace',
    { tabs: sessionWith().tabs.map(tabWith({ workspaceId: workspaceId(9) })) },
  ],
  [
    'a workspace that does not list its tab',
    {
      workspaces: sessionWith().workspaces.map(workspaceWith({ tabIds: [] })),
    },
  ],
  [
    'an active tab outside its workspace',
    {
      workspaces: sessionWith().workspaces.map(workspaceWith({ activeTabId: tabId(1) })),
    },
  ],
  [
    'a focused pane outside its layout',
    { tabs: sessionWith().tabs.map(tabWith({ focusedPaneId: paneId(1) })) },
  ],
  [
    'a zoomed pane outside its layout',
    { tabs: sessionWith().tabs.map(tabWith({ zoomedPaneId: paneId(3) })) },
  ],
  [
    'a pane in two layouts',
    {
      tabs: sessionWith().tabs.map(
        tabWith({
          layout: { kind: 'pane', paneId: paneId(3) } as const,
          focusedPaneId: paneId(3),
          zoomedPaneId: undefined,
        }),
      ),
    },
  ],
];

for (const [name, overrides] of disagreeing) {
  it(`reports ${name} as broken`, async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'session.json');
    await writeSession(path, await savedJson(sessionWith(overrides)));

    await expectBroken(path);
  });
}

const workspacesWith = (index: number, changes: Partial<Workspace>): Workspace[] =>
  sessionWith().workspaces.map((workspace, position) =>
    position === index ? workspaceWith(changes)(workspace) : workspace,
  );

const movedPane = (pane: SavedSession['panes'][number], owner: TabId) => ({
  ...pane,
  tabId: owner,
});

const panesWith = (id: PaneId, owner: TabId): SavedSession['panes'] =>
  sessionWith().panes.map((pane) => (pane.id === id ? movedPane(pane, owner) : pane));

// Each case breaks one rule only, so a check that is gone lets the session load.
const splitTab = (tab: Tab): Tab => ({
  ...tab,
  layout: {
    kind: 'split',
    direction: 'right',
    ratio: 0.5,
    first: { kind: 'pane', paneId: paneId(3) },
    second: { kind: 'pane', paneId: paneId(1) },
  },
  arrangement: { choice: 'legacy', order: [paneId(3), paneId(1)] },
});

const isolated: [string, Partial<SavedSession>][] = [
  [
    'a workspace id that appears twice',
    { workspaces: [...sessionWith().workspaces, ...sessionWith().workspaces.slice(0, 1)] },
  ],
  ['a next workspace number that is not above every workspace id', { nextWorkspaceNumber: 2 }],
  ['a next tab number that is not above every tab id', { nextTabNumber: 2 }],
  [
    'a workspace that lists the tab of another workspace',
    {
      workspaces: workspacesWith(0, { tabIds: [tabId(1), tabId(2)] }),
    },
  ],
  [
    'a workspace that lists a tab that does not exist',
    {
      workspaces: workspacesWith(0, { tabIds: [tabId(1), tabId(9)] }),
    },
  ],
  [
    'a tab that its workspace does not list',
    {
      tabs: [
        ...sessionWith().tabs,
        {
          id: tabId(4),
          workspaceId: workspaceId(2),
          layout: { kind: 'pane', paneId: paneId(4) },
          arrangement: { choice: 'legacy', order: [paneId(4)] },
          focusedPaneId: paneId(4),
          zoomedPaneId: undefined,
          label: undefined,
        },
      ],
      panes: [...sessionWith().panes, { id: paneId(4), tabId: tabId(4), startFolder: undefined }],
      nextTabNumber: 5,
      nextPaneNumber: 5,
    },
  ],
  [
    'a pane in two layouts',
    {
      tabs: sessionWith().tabs.map((tab) => (tab.id === tabId(2) ? splitTab(tab) : tab)),
    },
  ],
  [
    'a pane in the layout of another tab',
    {
      panes: panesWith(paneId(3), tabId(1)),
    },
  ],
  [
    'a pane of a tab that does not exist',
    {
      panes: panesWith(paneId(3), tabId(9)),
    },
  ],
];

it.each(isolated)('reports %s as broken', async (_name, overrides) => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  await writeSession(path, await savedJson(sessionWith(overrides)));

  await expectBroken(path);
});

it('accepts the unmodified session as written by hand', async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, 'session.json');
  const session = sessionWith();
  await writeSession(path, await savedJson(session));

  expect(await readSessionFile(path)).toEqual({ kind: 'restored', session });
});

it('gives each socket path its own file', () => {
  const first = sessionPathFor('/state', '/home/user', '/run/koja/one.sock');
  const second = sessionPathFor('/state', '/home/user', '/run/koja/two.sock');

  expect(first).not.toBe(second);
  expect(sessionPathFor('/state', '/home/user', '/run/koja/one.sock')).toBe(first);
  expect(first.startsWith('/state/koja/sessions/')).toBe(true);
  expect(first.endsWith('.json')).toBe(true);
});

it('falls back to ~/.local/state without a usable state home', () => {
  const socketPath = '/run/koja/one.sock';
  const fallback = sessionPathFor(undefined, '/home/user', socketPath);

  expect(fallback.startsWith('/home/user/.local/state/koja/sessions/')).toBe(true);
  expect(sessionPathFor('relative/state', '/home/user', socketPath)).toBe(fallback);
});
