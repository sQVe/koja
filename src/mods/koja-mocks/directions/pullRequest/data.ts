import type { FakeChange } from '../../scenes/shellContent.ts';
import type { ContentItem } from '../content/data.ts';
import { contentItems, pullFiles } from '../content/data.ts';

export type PullState =
  | 'blocked'
  | 'sent'
  | 'ready'
  | 'ready-menu'
  | 'merge-confirm'
  | 'merge-failed'
  | 'checks-failed'
  | 'unreachable'
  | 'normal'
  | 'zoomed';

type PromptTray = 'bar' | 'header' | 'section';
export type PullScene = PullState | 'tray-bar' | 'tray-header' | 'tray-section';

export interface PullView {
  state: PullState;
  tray: PromptTray;
  queued: boolean;
}

export interface PullThread {
  reference: string;
  path: string;
  author: string;
  text: string;
  snippet: string[];
}

export const pullViews: Record<PullScene, PullView> = {
  'tray-bar': { state: 'blocked', tray: 'bar', queued: true },
  'tray-header': { state: 'blocked', tray: 'header', queued: true },
  'tray-section': { state: 'blocked', tray: 'section', queued: true },
  blocked: { state: 'blocked', tray: 'bar', queued: false },
  sent: { state: 'sent', tray: 'bar', queued: false },
  ready: { state: 'ready', tray: 'bar', queued: false },
  'ready-menu': { state: 'ready-menu', tray: 'bar', queued: false },
  'merge-confirm': { state: 'merge-confirm', tray: 'bar', queued: false },
  'merge-failed': { state: 'merge-failed', tray: 'bar', queued: false },
  'checks-failed': { state: 'checks-failed', tray: 'bar', queued: false },
  unreachable: { state: 'unreachable', tray: 'bar', queued: false },
  normal: { state: 'normal', tray: 'bar', queued: false },
  zoomed: { state: 'zoomed', tray: 'bar', queued: true },
};

const readyStates = new Set<PullState>(['ready', 'ready-menu', 'merge-confirm', 'merge-failed']);

export const isReady = (state: PullState): boolean => readyStates.has(state);

const modifiedRows: FakeChange = {
  path: 'src/mods/koja-spaces/rows.ts',
  status: 'M',
  add: 86,
  del: 2,
};

const blockedFiles = pullFiles.map((file) =>
  file.path === modifiedRows.path ? modifiedRows : file,
);

const blockedTotals = {
  added: blockedFiles.reduce((sum, file) => sum + file.add, 0),
  removed: blockedFiles.reduce((sum, file) => sum + file.del, 0),
};

export const checkFailure = {
  path: 'src/mods/koja-spaces/rows.ts:48',
  message: "Type 'string' is not assignable to type 'RowLook'.",
  age: 'failed 3m ago',
  staleAge: 'failed 9m ago',
};

export const pullThreads: [PullThread, PullThread] = [
  {
    path: 'src/mods/koja-spaces/rows.ts',
    reference: 'rows.ts:48',
    author: 'jonas-l · 2h ago',
    text: 'Keep the selected row visible when the group folds.',
    snippet: ['47  const look = rowLook(space);', '48  return selectedRow(space, look);'],
  },
  {
    path: 'src/kit/repoLabel.ts',
    reference: 'repoLabel.ts:27–31',
    author: 'jonas-l · 1h ago',
    text: 'Can the branch truncate before the repository name?',
    snippet: ['27  label(repository).flex_none()', '28  label(branch).truncate()'],
  },
];

const readyFiles: FakeChange[] = [
  { path: 'src/mods/koja-stack/main.ts', status: 'A', add: 42, del: 0 },
  { path: 'src/mods/koja-stack/rows.ts', status: 'A', add: 28, del: 0 },
  { path: 'src/mods/koja-stack/rows.test.ts', status: 'A', add: 24, del: 0 },
  { path: 'src/kit/index.ts', status: 'M', add: 2, del: 1 },
  { path: 'config/layouts/koja.json', status: 'M', add: 4, del: 2 },
];

const blockedItem: ContentItem = {
  ...contentItems.pr,
  description: ['Keep the selected space and repository context visible when groups fold.'],
  facts: [
    { name: 'Branch', value: 'me-1090-design-the-sidebar → main', truncateMiddle: true },
    { name: 'Ticket', value: 'ME-1090', target: 'Linear' },
    { name: 'Checks', value: '1 failing · 3 passed', checkState: 'failing' },
    { name: 'Threads', value: '2 unresolved · 1 resolved' },
    { name: 'Review', value: 'Changes requested by jonas-l', wrap: true },
    { name: 'Files', value: '9 changed', diff: blockedTotals },
    { name: 'Agent', value: 'Design the sidebar', target: 'agent' },
  ],
};

const readyItem: ContentItem = {
  ...contentItems.pr,
  identifier: '#44',
  title: 'Add the stack panel',
  tab: '#44 Add the stack panel',
  description: [
    'Keep the active branch and its pull request together in the stack panel.',
    'Adds compact branch rows, review status, and a direct path back to the agent terminal.',
  ],
  facts: [
    { name: 'Branch', value: 'me-1091-stack-panel → main', truncateMiddle: true },
    { name: 'Ticket', value: 'ME-1091', target: 'Linear' },
    { name: 'Checks', value: '4 passed', checkState: 'passed' },
    { name: 'Threads', value: '0 unresolved · 2 resolved' },
    { name: 'Review', value: 'Approved by jonas-l' },
    { name: 'Merge', value: 'No conflicts' },
    { name: 'Files', value: '5 changed', diff: { added: 100, removed: 3 } },
    { name: 'Agent', value: 'Design the sidebar', target: 'agent' },
  ],
};

export const pullItem = (state: PullState): ContentItem => {
  if (state === 'unreachable') {
    return { ...blockedItem, title: null, state: null, readAge: null, facts: [] };
  }

  if (state === 'checks-failed') {
    const facts = blockedItem.facts.map((fact) =>
      fact.name === 'Checks' ? { ...fact, age: 'synced 6m ago' } : fact,
    );

    return { ...blockedItem, facts };
  }

  return isReady(state) ? readyItem : blockedItem;
};

export const filesFor = (state: PullState): FakeChange[] =>
  isReady(state) ? readyFiles : blockedFiles;
