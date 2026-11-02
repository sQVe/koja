// Every icon the kit ships, each a file in src/kit/icons/. The icons are Lucide's.
export const iconNames = [
  'chevron-down',
  'chevron-right',
  'command',
  'file',
  'folder',
  'folder-open',
  'git-branch',
  'git-compare',
  'keyboard',
  'loader-circle',
  'maximize-2',
  'monitor',
  'palette',
  'panel-bottom',
  'panel-right',
  'plus',
  'search',
  'server',
  'square-pen',
  'terminal',
  'x',
] as const;

export type IconName = (typeof iconNames)[number];
