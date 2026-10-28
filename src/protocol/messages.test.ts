import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { Snapshot } from '../store/store.ts';
import { piReportSchema } from './messages.ts';
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
  startFolder: undefined,
  restored: false,
  error: undefined,
};

const tab = {
  id: tabId(1),
  workspaceId: workspaceId(1),
  layout: { kind: 'pane' as const, paneId: pane.id },
  arrangement: { choice: 'legacy' as const, order: [pane.id] },
  focusedPaneId: pane.id,
  zoomedPaneId: undefined,
  label: undefined,
};

const workspace = {
  id: workspaceId(1),
  root: '/work/koja',
  label: 'koja',
  tabIds: [tab.id],
};

const view = {
  focusedWorkspaceId: workspace.id,
  activeTabs: [{ workspaceId: workspace.id, tabId: tab.id }],
  scrolls: [],
};

const emptySnapshot: Snapshot = {
  revision: 0,
  workspaces: [],
  tabs: [],
  panes: [],
  defaultView: { focusedWorkspaceId: undefined, activeTabs: [], scrolls: [] },
  attachedClientId: undefined,
  foregroundClientId: undefined,
  clients: [],
};

const theme = {
  foreground: 0x11_22_33,
  background: 0xdd_ee_ff,
  palette: Array.from({ length: 16 }, (_, index) => index * 0x01_01_01),
};

const client = { id: clientId(2), size: { columns: 80, rows: 24 }, theme: undefined, view };

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

const piReport = {
  processId: 100,
  piVersion: '1.4.0',
  sessionId: 'session-a',
  sessionFile: '/sessions/a.jsonl',
  leafId: 'leaf-1',
  provider: 'anthropic',
  model: 'sonnet',
  thinkingLevel: 'off',
  ownership: 'interactive' as const,
  event: { kind: 'start' as const, reason: 'startup' as const },
  sequence: 1,
};

const piStatusFields = {
  piVersion: '1.4.0',
  sessionId: undefined,
  sessionFile: undefined,
  leafId: undefined,
  provider: undefined,
  model: undefined,
  thinkingLevel: 'off',
  ownership: 'tauWorker' as const,
};

const piReportWithoutOptionals = {
  processId: 100,
  ...piStatusFields,
  event: { kind: 'shutdown' as const, reason: 'quit' as const },
  sequence: Number.MAX_SAFE_INTEGER,
};

const messages: ControlMessage[] = [
  { type: 'hello', version: build, size: undefined },
  { type: 'welcome' },
  { type: 'refused', client: build, server: { version: '1.2.4', ghostty: 'def456' } },
  { type: 'detach', clientId: undefined },
  { type: 'detach', clientId: client.id },
  { type: 'paneScroll', paneId: pane.id, to: 'top', clientId: undefined },
  { type: 'paneScroll', paneId: pane.id, to: 'bottom', clientId: client.id },
  { type: 'paneScroll', paneId: pane.id, to: 42, clientId: undefined },
  {
    type: 'paneCopy',
    paneId: pane.id,
    start: { row: 4, column: 2 },
    end: { row: 5, column: 0 },
    print: false,
  },
  {
    type: 'paneCopy',
    paneId: pane.id,
    start: { row: 4, column: 1 },
    end: { row: 4, column: 2 },
    print: true,
  },
  {
    type: 'paneCopy',
    paneId: pane.id,
    start: { row: 4, column: 2 },
    end: { row: 4, column: 2 },
    print: false,
  },
  { type: 'paneCopyResult', result: { ok: true, text: 'hi', clientId: client.id } },
  { type: 'paneCopyResult', result: { ok: false, reason: 'pruned', oldest: 3 } },
  { type: 'piReport', paneId: pane.id, token: 'a'.repeat(64), report: piReport },
  {
    type: 'piReport',
    paneId: pane.id,
    token: 'a'.repeat(64),
    report: piReportWithoutOptionals,
  },
  { type: 'piReportResult', result: { ok: true, status: 'recorded' } },
  { type: 'piReportResult', result: { ok: true, status: 'updated' } },
  { type: 'piReportResult', result: { ok: true, status: 'ignored' } },
  { type: 'piReportResult', result: { ok: false, reason: 'unauthorized' } },
  { type: 'piReportResult', result: { ok: false, reason: 'processNotInPane' } },
  { type: 'piReportResult', result: { ok: false, reason: 'processNotRecorded' } },
  { type: 'piReportResult', result: { ok: false, reason: 'unknownPane' } },
  { type: 'piReportResult', result: { ok: false, reason: 'staleGeneration' } },
  { type: 'piStatus', paneId: pane.id },
  { type: 'piStatusReply', paneId: pane.id, pi: null },
  {
    type: 'piStatusReply',
    paneId: pane.id,
    pi: { state: 'switching', ineligibleReasons: ['tauWorker', 'switchPending'] },
  },
  {
    type: 'piStatusReply',
    paneId: pane.id,
    pi: { state: 'reported', ...piStatusFields, ineligibleReasons: ['tauWorker', 'noSessionFile'] },
  },
  {
    type: 'piStatusReply',
    paneId: pane.id,
    pi: { state: 'lost', ...piStatusFields, ownership: 'interactive', ineligibleReasons: [] },
  },
  {
    type: 'piStatusReply',
    paneId: pane.id,
    pi: { state: 'reported', ...piStatusFields, ineligibleReasons: ['sessionNotSaved'] },
  },
  { type: 'stop' },
  { type: 'stopResult', result: { ok: true } },
  { type: 'stopResult', result: { ok: false, message: 'Cannot save the session to a file.' } },
  { type: 'resize', size: { columns: 120, rows: 40 } },
  { type: 'theme', theme },
  { type: 'ack', paneId: paneId(1), sequence: 7 },
  { type: 'resync' },
  { type: 'bell', count: 1 },
  { type: 'bell', count: 2 },
  { type: 'paneMove', paneId: pane.id, destination: { kind: 'tab', tabId: tab.id } },
  { type: 'paneMove', paneId: pane.id, destination: { kind: 'newTab' } },
  { type: 'paneMove', paneId: pane.id, destination: { kind: 'newWorkspace' } },
  {
    type: 'snapshot',
    snapshot: {
      ...emptySnapshot,
      defaultView: { ...view, scrolls: [{ paneId: pane.id, topRow: 12 }] },
    },
  },
  {
    type: 'snapshot',
    snapshot: {
      revision: 3,
      workspaces: [workspace],
      tabs: [tab],
      panes: [pane],
      defaultView: view,
      attachedClientId: client.id,
      foregroundClientId: client.id,
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
      activeTabId: tab.id,
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
  { type: 'change', revision: 5, change: { type: 'paneMoved', paneId: pane.id, tabId: tab.id } },
  { type: 'change', revision: 5, change: { type: 'tabRemoved', tabId: tab.id } },
  {
    type: 'change',
    revision: 5,
    change: {
      type: 'tabLayoutChanged',
      tabId: tab.id,
      layout: nested,
      arrangement: { choice: 'master', order: [paneId(3), pane.id, paneId(2)] },
    },
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
    change: {
      type: 'paneStateChanged',
      paneId: pane.id,
      lifecycle: 'exited',
      exitCode: 1,
      error: undefined,
    },
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
  { type: 'change', revision: 7, change: { type: 'clientViewChanged', clientId: client.id, view } },
  { type: 'change', revision: 7, change: { type: 'foregroundChanged', clientId: client.id } },
  { type: 'change', revision: 7, change: { type: 'foregroundChanged', clientId: undefined } },
  { type: 'change', revision: 8, change: { type: 'clientAttached', client: themedClient } },
  {
    type: 'change',
    revision: 9,
    change: { type: 'clientThemeChanged', clientId: client.id, theme },
  },
  { type: 'takenOver' },
  { type: 'detached' },
  { type: 'detachResult', result: { ok: true } },
  { type: 'detachResult', result: { ok: false, reason: 'noClient' } },
  { type: 'detachResult', result: { ok: false, reason: 'unknownClient' } },
  { type: 'paneScrollResult', result: { ok: true, clientId: client.id, topRow: 5 } },
  { type: 'paneScrollResult', result: { ok: true, clientId: client.id, topRow: undefined } },
  { type: 'paneScrollResult', result: { ok: false, reason: 'unknownPane' } },
  {
    type: 'paneRead',
    paneId: pane.id,
    requestId: 1,
    selection: { source: 'recent', lines: undefined },
  },
  {
    type: 'paneRead',
    paneId: pane.id,
    requestId: 2,
    selection: { source: 'visible', lines: 20 },
  },
  {
    type: 'paneRead',
    paneId: pane.id,
    requestId: 3,
    selection: { source: 'recentUnwrapped', lines: 0 },
  },
  {
    type: 'paneRead',
    paneId: pane.id,
    requestId: 4,
    selection: { source: 'range', from: 0, to: 9, epoch: undefined, screen: undefined },
  },
  {
    type: 'paneRead',
    paneId: pane.id,
    requestId: 5,
    selection: { source: 'range', from: 2 ** 40, to: 2 ** 40 + 3, epoch: 3, screen: undefined },
  },
  {
    type: 'paneReadFailed',
    paneId: pane.id,
    requestId: 4,
    failure: { reason: 'pruned', oldest: 2 ** 40 },
  },
  {
    type: 'paneReadFailed',
    paneId: pane.id,
    requestId: 5,
    failure: { reason: 'staleEpoch', epoch: 4 },
  },
  {
    type: 'paneReadFailed',
    paneId: pane.id,
    requestId: 6,
    failure: {
      reason: 'tooManyBytes',
      limitBytes: 16_777_216,
      epoch: 2,
      screen: 0,
      first: 5,
      count: 1001,
    },
  },
  {
    type: 'paneReadFailed',
    paneId: pane.id,
    requestId: 7,
    failure: { reason: 'noSnapshot' },
  },
  {
    type: 'paneReadFailed',
    paneId: pane.id,
    requestId: 8,
    failure: { reason: 'tooManyPendingReads', limit: 64 },
  },
  { type: 'paneReadNext', paneId: pane.id, requestId: 7 },
  { type: 'paneSend', paneId: pane.id, text: 'ls\r' },
  { type: 'paneSent', paneId: pane.id },
  { type: 'paneMissing', paneId: paneId(9) },
  { type: 'paneFolders' },
  {
    type: 'paneFoldersReply',
    panes: [
      { paneId: paneId(1), folder: '/tmp', foregroundFolder: '/var' },
      { paneId: paneId(2), folder: undefined, foregroundFolder: undefined },
    ],
  },
  { type: 'paneProcessInfo', paneId: paneId(1) },
  {
    type: 'paneProcessInfoReply',
    paneId: paneId(1),
    shellPid: 4100,
    foregroundGroup: 4120,
    processes: [
      { pid: 4120, name: 'sleep', argv: ['sleep', '60'], cmdline: 'sleep 60', folder: '/var' },
      { pid: 4121, name: 'cat', argv: ['cat'], cmdline: 'cat', folder: undefined },
    ],
  },
  {
    type: 'paneProcessInfoReply',
    paneId: paneId(1),
    shellPid: 4100,
    foregroundGroup: undefined,
    processes: [],
  },
  { type: 'workspaceCreate', root: '/work/koja', label: 'koja', focus: true },
  { type: 'workspaceCreate', root: '/work/koja', label: undefined, focus: false },
  { type: 'workspaceFocus', workspaceId: workspace.id },
  { type: 'workspaceRename', workspaceId: workspace.id, label: 'renamed' },
  { type: 'workspaceClose', workspaceId: workspace.id },
  { type: 'workspaceDone', workspaceId: workspace.id },
  { type: 'workspaceFailed', reason: 'unknownWorkspace', message: undefined },
  { type: 'tabCreate', workspaceId: workspace.id, cwd: undefined, focus: true },
  { type: 'tabFocus', tabId: tab.id },
  { type: 'tabClose', tabId: tab.id },
  { type: 'tabLayout', tabId: tab.id, choice: 'master' },
  { type: 'tabDone', tabId: tab.id },
  { type: 'paneAdd', paneId: paneId(2), cwd: '/work' },
  { type: 'paneFailed', reason: 'requiresLegacyLayout', message: undefined },
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

  if (message.type === 'snapshot' && message.snapshot.defaultView.scrolls.length > 0) {
    return 'snapshot with scroll rows';
  }

  if (message.type === 'snapshot' && message.snapshot.panes.length === 0) {
    return 'snapshot without a pane';
  }

  if (message.type === 'paneCopy') {
    return `paneCopy from ${message.start.row}:${message.start.column} to ${message.end.row}:${message.end.column}`;
  }

  if (message.type === 'paneMove') {
    return `paneMove to ${message.destination.kind}`;
  }

  if (message.type === 'bell') {
    return `bell of ${message.count}`;
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

const helloMessage = { type: 'hello', version: build, size: { columns: 80, rows: 24 } };
const resizeMessage = { type: 'resize', size: { columns: 80, rows: 24 } };
const ackMessage = { type: 'ack', paneId: 'pane-1', sequence: 7 };

const readMessage = {
  type: 'paneRead',
  paneId: 'pane-1',
  requestId: 1,
  selection: { source: 'recent', lines: null },
};

const rangeReadMessage = {
  ...readMessage,
  selection: { source: 'range', from: 0, to: 4, epoch: null, screen: null },
};

const paneResizeMessage = { type: 'paneResize', paneId: 'pane-1', direction: 'left', cells: 1 };
const themeMessage = { type: 'theme', theme };

const processInfoReplyMessage = {
  type: 'paneProcessInfoReply',
  paneId: 'pane-1',
  shellPid: 1,
  foregroundGroup: null,
  processes: [{ pid: 1, name: 'a', argv: [], cmdline: '', folder: null }],
};

const foldersReplyMessage = {
  type: 'paneFoldersReply',
  panes: [{ paneId: 'pane-1', folder: null, foregroundFolder: null }],
};

const detachOkMessage = { type: 'detachResult', result: { ok: true } };
const detachFailedMessage = { type: 'detachResult', result: { ok: false, reason: 'noClient' } };
const scrollMessage = { type: 'paneScroll', paneId: 'pane-1', to: 3, clientId: null };

const copyMessage = {
  type: 'paneCopy',
  paneId: 'pane-1',
  start: { row: 4, column: 2 },
  end: { row: 4, column: 3 },
  print: false,
};

const laterRowCopyMessage = {
  ...copyMessage,
  start: { row: 4, column: 1 },
  end: { row: 5, column: 2 },
};

const bellMessage = { type: 'bell', count: 1 };

const workspaceAddedMessage = (id: string, focusedId: string) => ({
  type: 'change',
  revision: 1,
  change: {
    type: 'workspaceAdded',
    workspace: { ...workspace, id },
    activeTabId: tab.id,
    focusedWorkspaceId: focusedId,
  },
});

const withoutField = (message: Record<string, unknown>, field: string) => {
  const { [field]: _removed, ...rest } = message;

  return rest;
};

// Each case is a valid base message and the same message changed in the one field its name gives.
const piReportMessage = {
  type: 'piReport',
  paneId: 'pane-1',
  token: 'a'.repeat(64),
  report: {
    processId: 100,
    piVersion: '1.4.0',
    sessionId: null,
    sessionFile: null,
    leafId: null,
    provider: null,
    model: null,
    thinkingLevel: 'off',
    ownership: 'interactive',
    event: { kind: 'tree' },
    sequence: 3,
  },
};

const withReport = (changes: Record<string, unknown>) => ({
  ...piReportMessage,
  report: { ...piReportMessage.report, ...changes },
});

const piStatusReplyMessage = { type: 'piStatusReply', paneId: 'pane-1', pi: null };

const switchingReplyMessage = {
  type: 'piStatusReply',
  paneId: 'pane-1',
  pi: { state: 'switching', ineligibleReasons: ['switchPending'] },
};

const {
  processId: _processId,
  event: _event,
  sequence: _sequence,
  ...piIdentity
} = piReportMessage.report;

const lostReplyMessage = {
  type: 'piStatusReply',
  paneId: 'pane-1',
  pi: {
    ...piIdentity,
    state: 'lost',
    ineligibleReasons: ['noSessionFile'],
  },
};

const piReportResultMessage = { type: 'piReportResult', result: { ok: true, status: 'recorded' } };

const piStatusMessage = { type: 'piStatus', paneId: 'pane-1' };

const layoutChangeMessage = {
  type: 'change',
  revision: 1,
  change: {
    type: 'tabLayoutChanged',
    tabId: 'tab-1',
    layout: { kind: 'pane', paneId: 'pane-1' },
    arrangement: { choice: 'legacy', order: ['pane-1'] },
  },
};

const refusedCases: [string, Record<string, unknown>, unknown][] = [
  [
    'a layout change with an unknown layout choice',
    layoutChangeMessage,
    {
      ...layoutChangeMessage,
      change: { ...layoutChangeMessage.change, arrangement: { choice: 'grid', order: ['pane-1'] } },
    },
  ],
  ['a missing field', resizeMessage, withoutField(resizeMessage, 'size')],
  [
    'a process info request without a pane',
    { type: 'paneProcessInfo', paneId: 'pane-1' },
    { type: 'paneProcessInfo' },
  ],
  [
    'a process info reply with a negative pid',
    processInfoReplyMessage,
    {
      ...processInfoReplyMessage,
      processes: [{ ...processInfoReplyMessage.processes[0], pid: -1 }],
    },
  ],
  [
    'a folders reply with a malformed pane id',
    foldersReplyMessage,
    { ...foldersReplyMessage, panes: [{ ...foldersReplyMessage.panes[0], paneId: 'x' }] },
  ],
  ['a resize with zero cells', paneResizeMessage, { ...paneResizeMessage, cells: 0 }],
  [
    'a resize with a fractional cell count',
    paneResizeMessage,
    { ...paneResizeMessage, cells: 1.5 },
  ],
  [
    'a resize with an unknown direction',
    paneResizeMessage,
    { ...paneResizeMessage, direction: 'in' },
  ],
  [
    'a theme palette with 15 colors',
    themeMessage,
    { type: 'theme', theme: { ...theme, palette: theme.palette.slice(1) } },
  ],
  [
    'a theme palette with 17 colors',
    themeMessage,
    { type: 'theme', theme: { ...theme, palette: [...theme.palette, 0] } },
  ],
  [
    'a theme color past 0xffffff',
    themeMessage,
    { type: 'theme', theme: { ...theme, foreground: 0x1_00_00_00 } },
  ],
  ['a wrong type', ackMessage, { ...ackMessage, sequence: '7' }],
  ['a fractional number', ackMessage, { ...ackMessage, sequence: 1.5 }],
  ['an unknown type', resizeMessage, { ...resizeMessage, type: 'shout' }],
  ['no type', resizeMessage, withoutField(resizeMessage, 'type')],
  ['a size of zero', resizeMessage, { ...resizeMessage, size: { columns: 0, rows: 24 } }],
  [
    'more columns than 65535',
    resizeMessage,
    { ...resizeMessage, size: { columns: 65_536, rows: 24 } },
  ],
  [
    'more rows than 65535',
    resizeMessage,
    { ...resizeMessage, size: { columns: 80, rows: 65_536 } },
  ],
  [
    'a hello size past 65535',
    helloMessage,
    { ...helloMessage, size: { columns: 65_536, rows: 24 } },
  ],
  ['an ack sequence past 32 bits', ackMessage, { ...ackMessage, sequence: 4_294_967_296 }],
  ['a negative ack sequence', ackMessage, { ...ackMessage, sequence: -1 }],
  ['a malformed pane id', readMessage, { ...readMessage, paneId: 'pane-01' }],
  [
    'a pane id past the safe integers',
    readMessage,
    { ...readMessage, paneId: 'pane-9007199254740993' },
  ],
  ['a request id past 32 bits', readMessage, { ...readMessage, requestId: 4_294_967_296 }],
  [
    'an unknown read source',
    readMessage,
    { ...readMessage, selection: { source: 'detection', lines: null } },
  ],
  [
    'a negative range start',
    rangeReadMessage,
    { ...rangeReadMessage, selection: { ...rangeReadMessage.selection, from: -1 } },
  ],
  ['a client id as a pane id', readMessage, { ...readMessage, paneId: 'client-1' }],
  [
    'a workspace id with a leading zero',
    workspaceAddedMessage('workspace-1', 'workspace-1'),
    workspaceAddedMessage('workspace-01', 'workspace-1'),
  ],
  [
    'a workspace id without a number',
    workspaceAddedMessage('workspace-1', 'workspace-1'),
    workspaceAddedMessage('workspace-', 'workspace-1'),
  ],
  [
    'a pane id as a workspace id',
    workspaceAddedMessage('workspace-1', 'workspace-1'),
    workspaceAddedMessage('pane-1', 'workspace-1'),
  ],
  [
    'a focused workspace id with a leading zero',
    workspaceAddedMessage('workspace-1', 'workspace-1'),
    workspaceAddedMessage('workspace-1', 'workspace-01'),
  ],
  [
    'a detach result that succeeds and names a failure',
    detachOkMessage,
    { type: 'detachResult', result: { ok: true, reason: 'unknownClient' } },
  ],
  [
    'a detach result that fails without a reason',
    detachFailedMessage,
    { type: 'detachResult', result: { ok: false } },
  ],
  ['a scroll to a negative row', scrollMessage, { ...scrollMessage, to: -1 }],
  ['a scroll to a word that is not a position', scrollMessage, { ...scrollMessage, to: 'middle' }],
  [
    'a copy that starts after its end',
    copyMessage,
    { ...copyMessage, start: { row: 4, column: 4 } },
  ],
  ['a copy with a negative column', copyMessage, { ...copyMessage, start: { row: 4, column: -1 } }],
  [
    'a copy that starts on a later row with an earlier column',
    laterRowCopyMessage,
    { ...laterRowCopyMessage, start: { row: 6, column: 1 } },
  ],
  ['a bell with a count of 0', bellMessage, { ...bellMessage, count: 0 }],
  ['a pi report with an unknown key', piReportMessage, withReport({ extra: 'x' })],
  [
    'a pi report with a piVersion one over its limit',
    piReportMessage,
    withReport({ piVersion: 'v'.repeat(65) }),
  ],
  ['a pi report with an empty sessionId', piReportMessage, withReport({ sessionId: '' })],
  [
    'a pi report with a sessionFile one over its limit',
    piReportMessage,
    withReport({ sessionFile: '/'.repeat(4097) }),
  ],
  [
    'a pi report with a processId that is not an integer',
    piReportMessage,
    withReport({ processId: 1.5 }),
  ],
  ['a pi report with a processId of 0', piReportMessage, withReport({ processId: 0 })],
  ['a pi report with an unknown ownership', piReportMessage, withReport({ ownership: 'worker' })],
  ['a pi report without an event', piReportMessage, withoutField(piReportMessage.report, 'event')],
  [
    'a pi report with an unknown event kind',
    piReportMessage,
    withReport({ event: { kind: 'compact' } }),
  ],
  [
    'a pi report with a start event of an unknown reason',
    piReportMessage,
    withReport({ event: { kind: 'start', reason: 'quit' } }),
  ],
  [
    'a pi report with a shutdown event of an unknown reason',
    piReportMessage,
    withReport({ event: { kind: 'shutdown', reason: 'startup' } }),
  ],
  [
    'a pi report with a shutdown event without a reason',
    piReportMessage,
    withReport({ event: { kind: 'shutdown' } }),
  ],
  [
    'a pi report with an event key it does not know',
    piReportMessage,
    withReport({ event: { kind: 'tree', leafId: 'x' } }),
  ],
  ['a pi report with a sequence of 0', piReportMessage, withReport({ sequence: 0 })],
  [
    'a pi report with a sequence that is not an integer',
    piReportMessage,
    withReport({ sequence: 1.5 }),
  ],
  [
    'a pi report with a sequence over the safe integers',
    piReportMessage,
    withReport({ sequence: Number.MAX_SAFE_INTEGER + 1 }),
  ],
  [
    'a pi report with an uppercase token',
    piReportMessage,
    { ...piReportMessage, token: 'A'.repeat(64) },
  ],
  [
    'a pi status reply with an unknown state',
    switchingReplyMessage,
    { ...switchingReplyMessage, pi: { ...switchingReplyMessage.pi, state: 'exited' } },
  ],
  [
    'a switching pi status with an identity',
    switchingReplyMessage,
    { ...switchingReplyMessage, pi: { ...switchingReplyMessage.pi, sessionId: 'session-a' } },
  ],
  [
    'a pi status reply with an unknown ineligible reason',
    switchingReplyMessage,
    { ...switchingReplyMessage, pi: { ...switchingReplyMessage.pi, ineligibleReasons: ['busy'] } },
  ],
  [
    'a pi status reply with more ineligible reasons than exist',
    switchingReplyMessage,
    {
      ...switchingReplyMessage,
      pi: {
        ...switchingReplyMessage.pi,
        ineligibleReasons: [
          'tauWorker',
          'switchPending',
          'noSessionFile',
          'sessionNotSaved',
          'tauWorker',
        ],
      },
    },
  ],
  [
    'a pi status reply without ineligible reasons',
    lostReplyMessage,
    { ...lostReplyMessage, pi: withoutField(lostReplyMessage.pi, 'ineligibleReasons') },
  ],
  [
    'a lost pi status with the reported sequence',
    lostReplyMessage,
    { ...lostReplyMessage, pi: { ...lostReplyMessage.pi, sequence: 3 } },
  ],
  [
    'a pi report with an unknown top-level key',
    piReportMessage,
    { ...piReportMessage, extra: 'x' },
  ],
  [
    'a pi report result with an unknown top-level key',
    piReportResultMessage,
    { ...piReportResultMessage, extra: 'x' },
  ],
  [
    'a pi status with an unknown top-level key',
    piStatusMessage,
    { ...piStatusMessage, extra: 'x' },
  ],
  [
    'a pi status reply with an unknown top-level key',
    piStatusReplyMessage,
    { ...piStatusReplyMessage, extra: 'x' },
  ],
];

it.each(refusedCases)('accepts the message before %s', (_name, base) => {
  expect(parseControl(text(JSON.stringify(base)))).toMatchObject({ ok: true });
});

it.each(refusedCases)('refuses a message with %s', (_name, _base, changed) => {
  expect(parseControl(text(JSON.stringify(changed)))).toEqual({
    ok: false,
    reason: 'invalidMessage',
  });
});

it('reads the absent optional fields of a pi report as undefined', () => {
  expect(parseControl(text(JSON.stringify(piReportMessage)))).toStrictEqual({
    ok: true,
    message: {
      type: 'piReport',
      paneId: paneId(1),
      token: 'a'.repeat(64),
      report: {
        processId: 100,
        piVersion: '1.4.0',
        sessionId: undefined,
        sessionFile: undefined,
        leafId: undefined,
        provider: undefined,
        model: undefined,
        thinkingLevel: 'off',
        ownership: 'interactive',
        event: { kind: 'tree' },
        sequence: 3,
      },
    },
  });
});

it('checks a pi report on its own, so the CLI can refuse it before it sends', () => {
  expect(piReportSchema.safeParse(piReportMessage.report).success).toBe(true);
  expect(piReportSchema.safeParse({ ...piReportMessage.report, extra: 'x' }).success).toBe(false);
});

it('refuses a JSON value that is not an object', () => {
  expect(parseControl(text('"hello"'))).toEqual({ ok: false, reason: 'invalidMessage' });
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
    defaultView: view,
    attachedClientId: clientId(5),
    foregroundClientId: undefined,
    clients: [{ id: clientId(5), size: { columns: 80, rows: 24 }, theme: undefined, view }],
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
    tabs: [
      {
        ...tab,
        layout: nested,
        arrangement: { choice: 'master', order: [paneId(3), pane.id, paneId(2)] },
        focusedPaneId: paneId(3),
      },
    ],
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
      arrangement: { choice: 'legacy', order: ['pane-1', 'pane-2', 'pane-3'] },
    },
  });

  expect(parseControl(text(json))).toEqual({ ok: false, reason: 'invalidMessage' });
});
