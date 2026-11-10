import { agentPane, changeRows } from '../../scenes/shellContent.ts';

export type DialogAsk = 'close' | 'rename' | 'wt-new' | 'wt-remove' | 'wt-open';

interface AskContent {
  title: string;
  action: string;
  destructive: boolean;
  detail: string[];
}

export const spaceName = 'Design the sidebar';

export const renameHint = 'Leave empty to use the folder name, “koja”.';

export const newBranch = 'me-1097-design-the-dialogs';

export const currentBranch = 'me-1090-design-the-sidebar';

export const newWorktreeFacts = {
  from: 'main',
  folder: `${agentPane.folder}/${newBranch}`,
};

export const branchDeletionHint = 'Local branch only. Its commits stay on GitHub in PR #41.';

export const lostChanges = changeRows;

export const removalClosingLines = [`Space “${spaceName}” closes.`, 'Claude Code stops.'];

export const askContent: Record<DialogAsk, AskContent> = {
  close: {
    title: `Close space “${spaceName}”?`,
    action: 'Close',
    destructive: true,
    detail: [
      'Claude Code and Pi stop mid-task, and 4 tabs close.',
      'Its folder, uncommitted changes, and branch stay.',
    ],
  },
  rename: {
    title: 'Rename space',
    action: 'Save',
    destructive: false,
    detail: [],
  },
  'wt-new': {
    title: 'New worktree in koja',
    action: 'Create',
    destructive: false,
    detail: [],
  },
  'wt-remove': {
    title: `Remove worktree ${currentBranch}?`,
    action: 'Remove',
    destructive: true,
    detail: ['3 uncommitted changes are lost:'],
  },
  'wt-open': {
    title: 'Open a worktree of koja',
    action: 'Open',
    destructive: false,
    detail: [],
  },
};

export const worktrees = [
  { branch: 'main', age: '2h', open: true },
  { branch: 'me-1091-side-panels', age: '3h', open: false },
  { branch: currentBranch, age: '1d', open: true },
  { branch: 'me-1096-overlays', age: '2d', open: false },
];
