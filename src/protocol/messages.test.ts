import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { Snapshot } from '../store/store.ts';
import { answerHello, encodeControl, parseControl } from './protocol.ts';
import type { ControlMessage } from './protocol.ts';

const build = { version: '1.2.3', ghostty: 'abc123' };

const text = (value: string) => new TextEncoder().encode(value);

const parseMessage = (bytes: Uint8Array): ControlMessage => {
  const result = parseControl(bytes);

  if (!result.ok) {
    throw new Error(`Expected a message, got ${result.reason}.`);
  }

  return result.message;
};

it('round-trips a hello with a version and a terminal size', () => {
  const hello: ControlMessage = { type: 'hello', version: build, size: { columns: 80, rows: 24 } };

  const bytes = encodeControl(hello);

  expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual(hello);
  expect(parseControl(bytes)).toEqual({ ok: true, message: hello });
});

const pane = {
  id: paneId(1),
  tabId: tabId(1),
  lifecycle: 'running' as const,
  size: { columns: 80, rows: 23 },
  generation: 1,
  exitCode: undefined,
};

const tab = {
  id: tabId(1),
  workspaceId: workspaceId(1),
  layout: { kind: 'pane' as const, paneId: pane.id },
  focusedPaneId: pane.id,
  zoomedPaneId: undefined,
};

const workspace = {
  id: workspaceId(1),
  root: '/work/phi',
  label: 'phi',
  tabIds: [tab.id],
  activeTabId: tab.id,
};

const emptySnapshot: Snapshot = {
  revision: 0,
  workspaces: [],
  tabs: [],
  panes: [],
  focusedWorkspaceId: undefined,
  attachedClientId: undefined,
  clients: [],
};

const theme = {
  foreground: 0x11_22_33,
  background: 0xdd_ee_ff,
  palette: Array.from({ length: 16 }, (_, index) => index * 0x01_01_01),
};

const client = { id: clientId(2), size: { columns: 80, rows: 24 }, theme: undefined };

const themedClient = { ...client, theme };

const nested = {
  kind: 'split' as const,
  direction: 'right' as const,
  ratio: 0.5,
  first: { kind: 'pane' as const, paneId: paneId(1) },
  second: {
    kind: 'split' as const,
    direction: 'below' as const,
    ratio: 0.5,
    first: { kind: 'pane' as const, paneId: paneId(2) },
    second: { kind: 'pane' as const, paneId: paneId(3) },
  },
};

const messages: ControlMessage[] = [
  { type: 'hello', version: build, size: undefined },
  { type: 'welcome' },
  { type: 'refused', client: build, server: { version: '1.2.4', ghostty: 'def456' } },
  { type: 'detach' },
  { type: 'stop' },
  { type: 'resize', size: { columns: 120, rows: 40 } },
  { type: 'theme', theme },
  { type: 'ack', paneId: paneId(1), sequence: 7 },
  { type: 'resync' },
  {
    type: 'snapshot',
    snapshot: {
      revision: 3,
      workspaces: [workspace],
      tabs: [tab],
      panes: [pane],
      focusedWorkspaceId: workspace.id,
      attachedClientId: client.id,
      clients: [client],
    },
  },
  { type: 'snapshot', snapshot: emptySnapshot },
  {
    type: 'change',
    revision: 1,
    change: {
      type: 'workspaceAdded',
      workspace,
      focusedWorkspaceId: workspace.id,
    },
  },
  { type: 'change', revision: 2, change: { type: 'workspaceFocused', workspaceId: workspace.id } },
  {
    type: 'change',
    revision: 3,
    change: { type: 'workspaceRenamed', workspaceId: workspace.id, label: 'docs' },
  },
  {
    type: 'change',
    revision: 3,
    change: { type: 'tabFocused', workspaceId: workspace.id, tabId: tab.id },
  },
  { type: 'change', revision: 4, change: { type: 'paneRemoved', paneId: pane.id } },
  { type: 'change', revision: 5, change: { type: 'tabRemoved', tabId: tab.id } },
  {
    type: 'change',
    revision: 5,
    change: { type: 'tabLayoutChanged', tabId: tab.id, layout: nested },
  },
  {
    type: 'change',
    revision: 5,
    change: { type: 'paneFocused', tabId: tab.id, paneId: paneId(3) },
  },
  {
    type: 'change',
    revision: 6,
    change: { type: 'workspaceRemoved', workspaceId: workspace.id, focusedWorkspaceId: undefined },
  },
  {
    type: 'change',
    revision: 7,
    change: {
      type: 'workspaceRemoved',
      workspaceId: workspace.id,
      focusedWorkspaceId: workspaceId(2),
    },
  },
  { type: 'change', revision: 2, change: { type: 'tabAdded', tab } },
  { type: 'change', revision: 1, change: { type: 'paneAdded', pane } },
  {
    type: 'change',
    revision: 2,
    change: { type: 'paneStateChanged', paneId: pane.id, lifecycle: 'exited', exitCode: 1 },
  },
  {
    type: 'change',
    revision: 3,
    change: { type: 'paneResized', paneId: pane.id, size: { columns: 100, rows: 30 } },
  },
  { type: 'change', revision: 4, change: { type: 'clientAttached', client } },
  {
    type: 'change',
    revision: 5,
    change: { type: 'clientResized', clientId: client.id, size: { columns: 90, rows: 20 } },
  },
  {
    type: 'change',
    revision: 6,
    change: { type: 'clientDetached', clientId: client.id, reason: 'takenOver' },
  },
  { type: 'change', revision: 7, change: { type: 'serverStopping' } },
  { type: 'change', revision: 8, change: { type: 'clientAttached', client: themedClient } },
  {
    type: 'change',
    revision: 9,
    change: { type: 'clientThemeChanged', clientId: client.id, theme },
  },
  { type: 'takenOver' },
  { type: 'detached' },
  { type: 'detachResult', detached: true },
  { type: 'detachResult', detached: false },
  { type: 'paneRead', paneId: pane.id },
  { type: 'paneRows', paneId: pane.id, rows: ['$ ls', ''] },
  { type: 'paneSend', paneId: pane.id, text: 'ls\r' },
  { type: 'paneSent', paneId: pane.id },
  { type: 'paneMissing', paneId: paneId(9) },
  { type: 'workspaceCreate', root: '/work/phi', label: 'phi', background: false },
  { type: 'workspaceCreate', root: '/work/phi', label: undefined, background: true },
  { type: 'workspaceFocus', workspaceId: workspace.id },
  { type: 'workspaceRename', workspaceId: workspace.id, label: 'renamed' },
  { type: 'workspaceClose', workspaceId: workspace.id },
  { type: 'workspaceDone', workspaceId: workspace.id },
  { type: 'workspaceFailed', reason: 'unknownWorkspace', message: undefined },
  { type: 'tabCreate', workspaceId: workspace.id },
  { type: 'tabFocus', tabId: tab.id },
  { type: 'tabClose', tabId: tab.id },
  { type: 'tabDone', tabId: tab.id },
  { type: 'paneZoom', paneId: paneId(2) },
  { type: 'paneResize', paneId: paneId(2), direction: 'left', cells: 3 },
  { type: 'paneFailed', reason: 'noSplit', message: undefined },
  { type: 'tabFailed', reason: 'unknownTab', message: undefined },
  { type: 'tabFailed', reason: 'paneFailedToStart', message: 'no such directory' },
  { type: 'workspaceFailed', reason: 'paneFailedToStart', message: 'no such directory' },
];

const nameOf = (message: ControlMessage): string => {
  if (message.type === 'change') {
    return `change ${message.change.type}`;
  }

  if (message.type === 'snapshot' && message.snapshot.panes.length === 0) {
    return 'snapshot without a pane';
  }

  return message.type;
};

for (const message of messages) {
  it(`round-trips ${nameOf(message)}`, () => {
    expect(parseControl(encodeControl(message))).toStrictEqual({ ok: true, message });
  });
}

it.each([
  ['a resize to the largest size', { type: 'resize', size: { columns: 65_535, rows: 65_535 } }],
  ['an ack of the largest sequence', { type: 'ack', paneId: paneId(1), sequence: 0xff_ff_ff_ff }],
] as const)('round-trips %s', (_name, message) => {
  expect(parseControl(encodeControl(message))).toStrictEqual({ ok: true, message });
});

const workspaceIdJson = (id: string): string =>
  JSON.stringify({
    type: 'change',
    revision: 1,
    change: {
      type: 'workspaceAdded',
      workspace: { ...workspace, id },
      focusedWorkspaceId: id,
    },
  });

it.each([
  ['a missing field', '{"type":"resize"}'],
  [
    'a resize with zero cells',
    '{"type":"paneResize","paneId":"pane-1","direction":"left","cells":0}',
  ],
  [
    'a resize with a fractional cell count',
    '{"type":"paneResize","paneId":"pane-1","direction":"left","cells":1.5}',
  ],
  [
    'a resize with an unknown direction',
    '{"type":"paneResize","paneId":"pane-1","direction":"in","cells":1}',
  ],
  [
    'a theme palette with 15 colors',
    JSON.stringify({ type: 'theme', theme: { ...theme, palette: theme.palette.slice(1) } }),
  ],
  [
    'a theme palette with 17 colors',
    JSON.stringify({ type: 'theme', theme: { ...theme, palette: [...theme.palette, 0] } }),
  ],
  [
    'a theme color past 0xffffff',
    JSON.stringify({ type: 'theme', theme: { ...theme, foreground: 0x1_00_00_00 } }),
  ],
  ['a wrong type', '{"type":"ack","paneId":1,"sequence":"7"}'],
  ['a fractional number', '{"type":"ack","paneId":1,"sequence":1.5}'],
  ['an unknown type', '{"type":"shout"}'],
  ['no type', '{"size":{"columns":80,"rows":24}}'],
  ['a size of zero', '{"type":"resize","size":{"columns":0,"rows":24}}'],
  ['more columns than 65535', '{"type":"resize","size":{"columns":65536,"rows":24}}'],
  ['more rows than 65535', '{"type":"resize","size":{"columns":80,"rows":65536}}'],
  [
    'a hello size past 65535',
    '{"type":"hello","version":{"version":"1.2.3","ghostty":"abc123"},"size":{"columns":65536,"rows":24}}',
  ],
  ['an ack sequence past 32 bits', '{"type":"ack","paneId":1,"sequence":4294967296}'],
  ['a negative ack sequence', '{"type":"ack","paneId":1,"sequence":-1}'],
  ['a malformed pane id', '{"type":"paneRead","paneId":"pane-01"}'],
  ['a pane id past the safe integers', '{"type":"paneRead","paneId":"pane-9007199254740993"}'],
  ['a client id as a pane id', '{"type":"paneRead","paneId":"client-1"}'],
  ['a workspace id with a leading zero', workspaceIdJson('workspace-01')],
  ['a workspace id without a number', workspaceIdJson('workspace-')],
  ['a pane id as a workspace id', workspaceIdJson('pane-1')],
  ['a JSON value that is not an object', '"hello"'],
])('refuses a message with %s', (_name, json) => {
  expect(parseControl(text(json))).toEqual({ ok: false, reason: 'invalidMessage' });
});

it.each([
  ['cut-off JSON', '{"type":'],
  ['no bytes', ''],
])('refuses %s', (_name, json) => {
  expect(parseControl(text(json))).toEqual({ ok: false, reason: 'invalidJson' });
});

it('refuses bytes that are not UTF-8', () => {
  expect(parseControl(Uint8Array.of(0x7b, 0xff, 0x7d))).toEqual({
    ok: false,
    reason: 'invalidText',
  });
});

it('welcomes a hello from the same build', () => {
  const hello = { type: 'hello' as const, version: { ...build }, size: undefined };

  expect(answerHello(build, hello)).toEqual({ type: 'welcome' });
});

it.each([
  ['version', { version: '1.2.4', ghostty: build.ghostty }],
  ['Ghostty commit', { version: build.version, ghostty: 'def456' }],
])('refuses a hello with another %s and names both versions', (_name, version) => {
  const hello = { type: 'hello' as const, version, size: { columns: 80, rows: 24 } };

  expect(answerHello(build, hello)).toEqual({ type: 'refused', client: version, server: build });
});

it('parses a snapshot into ids the store accepts', () => {
  const sent: Snapshot = {
    revision: 2,
    workspaces: [workspace],
    tabs: [tab],
    panes: [{ ...pane, id: paneId(4) }],
    focusedWorkspaceId: workspace.id,
    attachedClientId: clientId(5),
    clients: [{ id: clientId(5), size: { columns: 80, rows: 24 }, theme: undefined }],
  };

  const message = parseMessage(encodeControl({ type: 'snapshot', snapshot: sent }));

  if (message.type !== 'snapshot') {
    throw new Error(`Expected a snapshot, got ${message.type}.`);
  }

  const received: Snapshot = message.snapshot;

  expect(received.panes[0]?.id).toBe(paneId(4));
  expect(received.workspaces[0]?.id).toBe(workspaceId(1));
  expect(received.attachedClientId).toBe(clientId(5));
  expect(received).toStrictEqual(sent);
});

it('round trips a snapshot with a split layout', () => {
  const sent: Snapshot = {
    ...emptySnapshot,
    workspaces: [workspace],
    tabs: [{ ...tab, layout: nested, focusedPaneId: paneId(3) }],
  };

  const message = parseMessage(encodeControl({ type: 'snapshot', snapshot: sent }));

  expect(message).toStrictEqual({ type: 'snapshot', snapshot: sent });
});

it.each([0, 1, 1.5])('refuses a split with ratio %d', (ratio) => {
  const json = JSON.stringify({
    type: 'change',
    revision: 1,
    change: {
      type: 'tabLayoutChanged',
      tabId: 'tab-1',
      layout: { ...nested, ratio },
    },
  });

  expect(parseControl(text(json))).toEqual({ ok: false, reason: 'invalidMessage' });
});
