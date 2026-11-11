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

export const isBottomBarView = (view: PullView): boolean => view.tray === 'bar';

const resolvedReviewStates = new Set<PullState>([
  'ready',
  'ready-menu',
  'merge-confirm',
  'merge-failed',
]);

export const hasResolvedReview = (state: PullState): boolean => resolvedReviewStates.has(state);

const modifiedRows: FakeChange = {
  path: 'src/mods/koja-spaces/rows.ts',
  status: 'M',
  add: 86,
  del: 2,
};

export const pullRequestFiles = pullFiles.map((file) =>
  file.path === modifiedRows.path ? modifiedRows : file,
);

const blockedTotals = {
  added: pullRequestFiles.reduce((sum, file) => sum + file.add, 0),
  removed: pullRequestFiles.reduce((sum, file) => sum + file.del, 0),
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
    snippet: [
      '27  label(repository).flex_none()',
      '28  label(branch).truncate()',
      '29    .min_w(0)',
      '30    .flex_1()',
      '31    .tooltip(branch)',
    ],
  },
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

export const pullItem = (view: PullView): ContentItem => {
  if (view.state === 'unreachable') {
    return { ...blockedItem, title: null, state: null, readAge: null, facts: [] };
  }

  if (!isBottomBarView(view)) {
    return blockedItem;
  }

  const facts = blockedItem.facts.filter((fact) =>
    ['Branch', 'Ticket', 'Agent'].includes(fact.name),
  );

  return { ...blockedItem, facts };
};
