import type { PaneInfo, TabInfo } from 'herdr';

import { recordOf, stringOf } from './fields.ts';

const taskByAddress = (terminalRecords: readonly unknown[]): Map<string, string> => {
  const tasks = new Map<string, string>();

  for (const record of terminalRecords) {
    const terminal = recordOf(record);
    const address = stringOf(terminal['address']);
    const task = stringOf(recordOf(terminal['labels'])['tau.task']) ?? '';

    if (address !== null && task !== '') {
      tasks.set(address, task);
    }
  }

  return tasks;
};

const workerTasksOf = (
  tabInfo: TabInfo,
  paneList: PaneInfo[],
  tasks: ReadonlyMap<string, string>,
): string[] => {
  const tabTasks = paneList
    .filter((pane) => pane.tab === tabInfo.id && pane.terminal !== null)
    .map((pane) => tasks.get(pane.terminal ?? ''));

  const taskList = tabTasks.filter((task): task is string => task !== undefined);

  return taskList.length === tabTasks.length ? taskList : [];
};

const workerLabel = (tasks: readonly string[]): string => {
  const [first = '', ...others] = tasks;

  return others.length === 0 ? first : `${first} +${others.length}`;
};

const tabNameOf = (
  tabInfo: TabInfo,
  program: PaneInfo['program'] | undefined,
  paneList: PaneInfo[],
  tasks: ReadonlyMap<string, string>,
): string => {
  if (tabInfo.named) {
    return tabInfo.name;
  }

  const workerTasks = workerTasksOf(tabInfo, paneList, tasks);

  if (workerTasks.length > 0) {
    return workerLabel(workerTasks);
  }

  return program?.name ?? 'Terminal';
};

export const tabLabel = (
  tabInfo: TabInfo,
  program: PaneInfo['program'] | undefined,
  paneList: PaneInfo[],
  terminalRecords: readonly unknown[],
): string => {
  const name = tabNameOf(tabInfo, program, paneList, taskByAddress(terminalRecords));

  return tabInfo.zoomed ? `${name} Z` : name;
};

export const tabProgram = (
  tabInfo: TabInfo,
  paneList: PaneInfo[],
): PaneInfo['program'] | undefined => {
  const tabPanes = paneList.filter((pane) => pane.tab === tabInfo.id && pane.terminal !== null);

  return (tabPanes.find((pane) => pane.program.agent) ?? tabPanes[0])?.program;
};
