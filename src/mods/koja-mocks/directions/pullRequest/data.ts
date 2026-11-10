import type { FakeChange } from '../../scenes/shellContent.ts';
import type { ContentItem } from '../content/data.ts';
import { contentItems, pullFiles } from '../content/data.ts';

export type PullVariant = 'reader' | 'box' | 'handoff';
export type PullState = 'blocked' | 'ready' | 'diff';

export interface PullThread {
  path: string;
  reference: string;
  author: string;
  text: string;
  snippet: string[];
}

export interface DiffLine {
  old: number | null;
  current: number | null;
  kind: 'context' | 'added' | 'removed';
  text: string;
  thread?: PullThread;
}

interface DiffHunk {
  range: string;
  lines: DiffLine[];
}

export interface PullDiff {
  path: string;
  added: number;
  removed: number;
  hunks: DiffHunk[];
}

const modifiedRows: FakeChange = {
  path: 'src/mods/koja-spaces/rows.ts',
  status: 'M',
  add: 86,
  del: 2,
};

const blockedFiles: FakeChange[] = pullFiles.map((file) =>
  file.path === modifiedRows.path ? modifiedRows : file,
);

export const blockedTotals = {
  added: blockedFiles.reduce((sum, file) => sum + file.add, 0),
  removed: blockedFiles.reduce((sum, file) => sum + file.del, 0),
};

export const checkFailure = {
  path: 'src/mods/koja-spaces/rows.ts:48',
  message: "Type 'string' is not assignable to type 'RowLook'.",
  age: 'failed 3m ago',
};

export const pullChecks = [
  { name: 'typecheck', detail: 'passed in 18s' },
  { name: 'tests', detail: 'passed in 1m 12s' },
  { name: 'style', detail: 'passed in 9s' },
  { name: 'build', detail: 'passed in 24s' },
];

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
    { name: 'Branch', value: 'me-1090-design-the-sidebar → main', wrap: true },
    { name: 'Ticket', value: 'ME-1090', target: 'Linear' },
    { name: 'Checks', value: '1 failing · 3 passed', checkState: 'failing' },
    { name: 'Threads', value: '2 unresolved · 1 resolved' },
    { name: 'Review', value: 'Changes requested by jonas-l', wrap: true },
    { name: 'Files', value: '9 changed', diff: blockedTotals },
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
    { name: 'Branch', value: 'me-1091-stack-panel → main', wrap: true },
    { name: 'Ticket', value: 'ME-1091', target: 'Linear' },
    { name: 'Checks', value: '4 passed', checkState: 'passed' },
    { name: 'Threads', value: '0 unresolved · 2 resolved' },
    { name: 'Review', value: 'Approved by jonas-l' },
    { name: 'Merge', value: 'No conflicts' },
    { name: 'Files', value: '5 changed', diff: { added: 100, removed: 3 } },
  ],
};

export const pullItem = (variant: PullVariant, state: PullState): ContentItem => {
  const item = state === 'ready' ? readyItem : blockedItem;

  if (variant !== 'handoff') {
    return item;
  }

  return {
    ...item,
    facts: [...item.facts, { name: 'Agent', value: 'Design the sidebar', target: 'agent' }],
  };
};

export const filesFor = (state: PullState): FakeChange[] =>
  state === 'ready' ? readyFiles : blockedFiles;

export const pullDiffs: [PullDiff, PullDiff] = [
  {
    path: 'src/mods/koja-spaces/rows.ts',
    added: 86,
    removed: 2,
    hunks: [
      {
        range: '@@ −45,4 +45,5 @@ selected space',
        lines: [
          { old: 45, current: 45, kind: 'context', text: 'export const groupRow = (space) => {' },
          { old: 46, current: null, kind: 'removed', text: '  if (space.folded) return null;' },
          {
            old: null,
            current: 46,
            kind: 'added',
            text: '  if (space.folded && !space.selected) return null;',
          },
          { old: 47, current: 47, kind: 'context', text: '  const look = rowLook(space);' },
          {
            old: null,
            current: 48,
            kind: 'added',
            text: '  return selectedRow(space, look);',
            thread: pullThreads[0],
          },
          { old: 48, current: 49, kind: 'context', text: '};' },
        ],
      },
      {
        range: '@@ −70,3 +71,4 @@ visible rows',
        lines: [
          {
            old: 70,
            current: 71,
            kind: 'context',
            text: 'const visibleRows = groups.flatMap((group) => {',
          },
          {
            old: 71,
            current: null,
            kind: 'removed',
            text: '  return group.folded ? [] : group.spaces;',
          },
          {
            old: null,
            current: 72,
            kind: 'added',
            text: '  return group.spaces.filter(isVisible);',
          },
          { old: 72, current: 73, kind: 'context', text: '});' },
          { old: null, current: 74, kind: 'added', text: '  return visibleRows;' },
        ],
      },
    ],
  },
  {
    path: 'src/kit/repoLabel.ts',
    added: 18,
    removed: 10,
    hunks: [
      {
        range: '@@ −27,3 +27,4 @@ repository and branch',
        lines: [
          { old: 27, current: null, kind: 'removed', text: '  label(repository).flex_1()' },
          { old: null, current: 27, kind: 'added', text: '  label(repository).flex_none()' },
          { old: 28, current: 28, kind: 'context', text: '  label(branch).truncate()' },
          { old: null, current: 29, kind: 'added', text: '    .min_w(0).flex_1()' },
          { old: 29, current: 30, kind: 'context', text: ');' },
        ],
      },
    ],
  },
];
