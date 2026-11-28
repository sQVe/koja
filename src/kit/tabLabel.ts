import type { PaneInfo, TabInfo } from 'herdr';

import { terminalMetadata } from '../data/terminalRecord.ts';

export const taskIndexOf = (terminalRecords: readonly unknown[]): Map<unknown, string> => {
  const tasks = new Map<unknown, string>();

  for (const [address, metadata] of terminalMetadata(terminalRecords)) {
    if (metadata.task !== null) {
      tasks.set(address, metadata.task);
    }
  }

  return tasks;
};

export const taskOfPane = (pane: PaneInfo, tasks: ReadonlyMap<unknown, string>): string | null =>
  tasks.get(pane.terminal) ?? null;

const tabPanesOf = (tabInfo: TabInfo, paneList: PaneInfo[]): PaneInfo[] =>
  paneList.filter((pane) => pane.tab === tabInfo.id && pane.terminal !== null);

const workerTasksOf = (tabPanes: PaneInfo[], tasks: ReadonlyMap<unknown, string>): string[] => {
  const tabTasks = tabPanes.map((pane) => tasks.get(pane.terminal));

  const taskList = tabTasks.filter((task): task is string => task !== undefined);

  return taskList.length === tabTasks.length ? taskList : [];
};

const workerLabel = (tasks: readonly string[]): string | null => {
  const [first, ...others] = tasks;

  if (first === undefined) {
    return null;
  }

  const suffix = others.length === 0 ? '' : ` +${others.length}`;

  return `${first}${suffix}`;
};

// An agent reports its work in the terminal title after a status glyph or a blinking mark. A title
// that starts with a bracket or a quote keeps it, and a path keeps its leading marker so the path
// guard still reads it.
const cleanTitle = (title: string): string =>
  title
    .replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}'"~/]+/u, '')
    .replace(/^\[ [!.] \] /, '')
    .trim();

const isPath = (title: string): boolean =>
  /^[~/]|^[A-Za-z]:\\/.test(title.replace(/^[^\p{L}\p{N}~/]+/u, ''));

const tabLead = (tabPanes: PaneInfo[]): PaneInfo | undefined =>
  tabPanes.find((pane) => pane.program.agent) ?? tabPanes[0];

const namesThePlace = (title: string, pane: PaneInfo): boolean =>
  title === pane.terminal ||
  title === pane.program.name ||
  title.toLowerCase() === pane.program.key;

const holdsWord = (title: string): boolean => /[\p{L}\p{N}]/u.test(title);

const describesWork = (title: string, pane: PaneInfo): boolean =>
  holdsWord(title) && !title.includes('@') && !namesThePlace(title, pane);

// The cleaned title when it tells the work, so the name and the path guard read the same string.
const workTitle = (pane: PaneInfo): string | null => {
  const title = cleanTitle(pane.title);

  if (!describesWork(title, pane) || isPath(title)) {
    return null;
  }

  return title;
};

const liveTitle = (lead: PaneInfo | undefined): string | null => {
  if (lead === undefined || !lead.program.agent) {
    return null;
  }

  return workTitle(lead);
};

export const ownName = (
  tabInfo: TabInfo,
  program: PaneInfo['program'] | undefined,
): string | null => (tabInfo.named && tabInfo.name !== program?.name ? tabInfo.name : null);

const tabNameFromTaskLookup = (
  tabInfo: TabInfo,
  program: PaneInfo['program'] | undefined,
  paneList: PaneInfo[],
  tasksOf: () => ReadonlyMap<unknown, string>,
): string => {
  const own = ownName(tabInfo, program);

  if (own !== null) {
    return own;
  }

  const tabPanes = tabPanesOf(tabInfo, paneList);
  const workerName = workerLabel(workerTasksOf(tabPanes, tasksOf()));

  if (workerName !== null) {
    return workerName;
  }

  const live = liveTitle(tabLead(tabPanes));

  if (live !== null) {
    return live;
  }

  return program?.name ?? 'Terminal';
};

export const tabNameWithTasks = (
  tabInfo: TabInfo,
  program: PaneInfo['program'] | undefined,
  paneList: PaneInfo[],
  tasks: ReadonlyMap<unknown, string>,
): string => tabNameFromTaskLookup(tabInfo, program, paneList, () => tasks);

export const tabName = (
  tabInfo: TabInfo,
  program: PaneInfo['program'] | undefined,
  paneList: PaneInfo[],
  terminalRecords: readonly unknown[],
): string => tabNameFromTaskLookup(tabInfo, program, paneList, () => taskIndexOf(terminalRecords));

const zoomedLabel = (tabInfo: TabInfo, name: string): string =>
  tabInfo.zoomed ? `${name} Z` : name;

export const tabLabelWithTasks = (
  tabInfo: TabInfo,
  program: PaneInfo['program'] | undefined,
  paneList: PaneInfo[],
  tasks: ReadonlyMap<unknown, string>,
): string => zoomedLabel(tabInfo, tabNameWithTasks(tabInfo, program, paneList, tasks));

export const tabLabel = (
  tabInfo: TabInfo,
  program: PaneInfo['program'] | undefined,
  paneList: PaneInfo[],
  terminalRecords: readonly unknown[],
): string => zoomedLabel(tabInfo, tabName(tabInfo, program, paneList, terminalRecords));

export const tabProgram = (
  tabInfo: TabInfo,
  paneList: PaneInfo[],
): PaneInfo['program'] | undefined => tabLead(tabPanesOf(tabInfo, paneList))?.program;
