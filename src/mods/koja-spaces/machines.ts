import { listOf, recordOf, stringOf } from '../../kit/fields.ts';

export interface Machine {
  name: string;
  state: string | null;
}

export const readMachines = (stdout: string): Machine[] =>
  listOf(recordOf(JSON.parse(stdout))['machines'])
    .map(recordOf)
    .filter((machine) => machine['temporary'] !== true)
    .map((machine) => ({
      name: stringOf(machine['name']) ?? '',
      state: stringOf(machine['state']),
    }));

export const machineGroupOrder = (
  remoteNames: Iterable<string>,
  known: Machine[],
): (string | null)[] => {
  const names = [...new Set([...remoteNames, ...known.map((machine) => machine.name)])].toSorted();

  return [null, ...names];
};

export const isMachineLoading = (
  layout: string | undefined,
  connected: boolean,
  waitingForSpace: boolean,
): boolean => {
  const waitingForLayout = layout === undefined && connected;

  return layout === 'loading' || waitingForLayout || waitingForSpace;
};
