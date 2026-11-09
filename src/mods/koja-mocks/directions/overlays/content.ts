import type { IconName } from '../../../../kit/index.ts';
import type { FakeSpace } from '../sidebars/content.ts';
import { fakeProjects } from '../sidebars/content.ts';

interface FakeCommand {
  title: string;
  keys: string[];
  icon: IconName;
}

export interface CommandGroup {
  name: string;
  letter: string;
  commands: FakeCommand[];
}

interface KeyAction {
  key: string;
  action: string;
}

export interface KeyGroup {
  name: string;
  keys: KeyAction[];
}

export interface PlacedSpace {
  space: FakeSpace;
  project: string;
}

export interface MenuItem {
  label: string;
  icon: IconName;
  keys: string[];
  divided?: boolean;
}

export interface FakeAgent {
  name: string;
  key: string | null;
}

export const paletteGroups: CommandGroup[] = [
  {
    name: 'Tabs',
    letter: 't',
    commands: [
      { title: 'New tab', keys: ['t', 'n'], icon: 'plus' },
      { title: 'Rename tab', keys: ['t', 'r'], icon: 'square-pen' },
      { title: 'Next tab', keys: ['t', 'l'], icon: 'chevron-right' },
      { title: 'Close tab', keys: ['t', 'q'], icon: 'x' },
    ],
  },
  {
    name: 'Panes',
    letter: 'w',
    commands: [
      { title: 'Split right', keys: ['w', 'v'], icon: 'panel-right' },
      { title: 'Split down', keys: ['w', 's'], icon: 'panel-bottom' },
      { title: 'Zoom pane', keys: ['w', 'm'], icon: 'maximize-2' },
      { title: 'Close pane', keys: ['w', 'q'], icon: 'x' },
    ],
  },
  {
    name: 'Spaces',
    letter: 's',
    commands: [
      { title: 'Find a space…', keys: ['s', 'f'], icon: 'search' },
      { title: 'New space', keys: ['s', 'n'], icon: 'plus' },
      { title: 'Rename space', keys: ['s', 'r'], icon: 'square-pen' },
      { title: 'Next space', keys: ['s', 'j'], icon: 'chevron-right' },
    ],
  },
];

export const paneKeys: KeyGroup[] = [
  {
    name: 'Focus',
    keys: [
      { key: 'h', action: 'Left' },
      { key: 'j', action: 'Down' },
      { key: 'k', action: 'Up' },
      { key: 'l', action: 'Right' },
      { key: 'w', action: 'Next pane' },
      { key: 'p', action: 'Last pane' },
    ],
  },
  {
    name: 'Move',
    keys: [
      { key: '⇧H', action: 'Left' },
      { key: '⇧J', action: 'Down' },
      { key: '⇧K', action: 'Up' },
      { key: '⇧L', action: 'Right' },
    ],
  },
  {
    name: 'Split',
    keys: [
      { key: 'v', action: 'Right' },
      { key: 's', action: 'Down' },
    ],
  },
  {
    name: 'Zoom and close',
    keys: [
      { key: 'm', action: 'Zoom' },
      { key: 'q', action: 'Close' },
      { key: 'o', action: 'Close others' },
    ],
  },
];

export const placedSpaces: PlacedSpace[] = fakeProjects.flatMap((project) =>
  project.spaces.map((space) => ({ space, project: project.name })),
);

export const paneMenu: MenuItem[] = [
  { label: 'Split right', icon: 'panel-right', keys: ['w', 'v'] },
  { label: 'Split down', icon: 'panel-bottom', keys: ['w', 's'] },
  { label: 'Zoom', icon: 'maximize-2', keys: ['w', 'm'] },
  { label: 'Send right-clicks to pane', icon: 'terminal', keys: [] },
  { label: 'Close pane', icon: 'x', keys: ['w', 'q'], divided: true },
];

export const newTerminal: MenuItem = { label: 'Terminal', icon: 'terminal', keys: ['t', 'n'] };

export const newPlaces: MenuItem[] = [
  { label: 'Empty space', icon: 'plus', keys: ['s', 'n'] },
  { label: 'From a new worktree…', icon: 'git-branch', keys: [] },
  { label: 'From an existing worktree…', icon: 'git-branch', keys: [] },
];

export const newAgents: FakeAgent[] = [
  { name: 'Claude Code', key: '1' },
  { name: 'Codex', key: '2' },
  { name: 'Pi', key: '3' },
  { name: 'OpenCode', key: null },
  { name: 'Cursor', key: null },
];

export const notInstalled = 'not installed';
