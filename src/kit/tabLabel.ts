import type { PaneInfo, TabInfo } from 'herdr';

import { recordOf, stringOf } from './fields.ts';

const taskByAddress = (terminalRecords: readonly unknown[]): Map<unknown, string> => {
  const tasks = new Map<unknown, string>();

  for (const record of terminalRecords) {
    const terminal = recordOf(record);
    const task = stringOf(recordOf(terminal['labels'])['tau.task']);

    if (task !== null && task !== '') {
      tasks.set(terminal['address'], task);
    }
  }

  return tasks;
};

export const taskOfPane = (pane: PaneInfo, terminalRecords: readonly unknown[]): string | null =>
  taskByAddress(terminalRecords).get(pane.terminal) ?? null;

const workerTasksOf = (
  tabInfo: TabInfo,
  paneList: PaneInfo[],
  tasks: ReadonlyMap<unknown, string>,
): string[] => {
  const tabTasks = paneList
    .filter((pane) => pane.tab === tabInfo.id && pane.terminal !== null)
    .map((pane) => tasks.get(pane.terminal));

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

export const tabName = (
  tabInfo: TabInfo,
  program: PaneInfo['program'] | undefined,
  paneList: PaneInfo[],
  terminalRecords: readonly unknown[],
): string => {
  if (tabInfo.named) {
    return tabInfo.name;
  }

  const tasks = taskByAddress(terminalRecords);
  const workerName = workerLabel(workerTasksOf(tabInfo, paneList, tasks));

  if (workerName !== null) {
    return workerName;
  }

  return program?.name ?? 'Terminal';
};

export const tabLabel = (
  tabInfo: TabInfo,
  program: PaneInfo['program'] | undefined,
  paneList: PaneInfo[],
  terminalRecords: readonly unknown[],
): string => {
  const name = tabName(tabInfo, program, paneList, terminalRecords);

  return tabInfo.zoomed ? `${name} Z` : name;
};

export const tabProgram = (
  tabInfo: TabInfo,
  paneList: PaneInfo[],
): PaneInfo['program'] | undefined => {
  const tabPanes = paneList.filter((pane) => pane.tab === tabInfo.id && pane.terminal !== null);

  return (tabPanes.find((pane) => pane.program.agent) ?? tabPanes[0])?.program;
};
