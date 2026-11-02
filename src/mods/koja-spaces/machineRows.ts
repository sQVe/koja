// The sidebar's machine groups: a header per machine, and a row per space under it. The view
// supplies the space rows and the fold and loading state.

import type { Element } from 'gpui-kit';

import {
  detailText,
  emptyState,
  icon,
  iconButton,
  iconSlot,
  indicator,
  listRow,
  sectionHeader,
} from '../../kit/index.ts';
import type { Machine } from './machines.ts';
import { machineGroupOrder } from './machines.ts';
import type { TreeRow } from './tree.ts';

export interface MachineRowsHost {
  machineList: Machine[];
  rows: TreeRow[];
  draw: (row: TreeRow) => Element;
  folded: (machine: string | null) => boolean;
  loading: (machine: string | null) => boolean;
  addSpace: (machine: string | null) => void;
  toggleFold: (machine: string | null) => void;
}

const connected = (machineList: Machine[], machine: string | null): boolean =>
  machine === null ||
  machineList.find((candidate) => candidate.name === machine)?.state === 'connected';

const loadingRow = (collapsed: boolean): Element => emptyState(collapsed ? '…' : 'Loading…');

// A connected machine offers a new space there; another says why it is away.
const machineState = (host: MachineRowsHost, machine: string | null): Element => {
  if (!connected(host.machineList, machine)) {
    const known = host.machineList.find((candidate) => candidate.name === machine);

    return detailText((known?.state ?? 'asleep').replaceAll('_', ' '));
  }

  return iconButton({ name: 'plus', size: 'small' })
    .id(`machine-add-${machine ?? 'local'}`)
    .on_click((_event, cx) => {
      cx.stop_propagation();
      host.addSpace(machine);
    });
};

const machineHeader = (
  host: MachineRowsHost,
  machine: string | null,
  collapsed: boolean,
): Element => {
  const folded = host.folded(machine);
  const state = collapsed ? [] : [machineState(host, machine)];
  const label = collapsed ? '' : (machine ?? 'This computer');

  return sectionHeader({
    label,
    size: 'default',
    interactive: true,
    start: icon(machine === null ? 'monitor' : 'server', 'small'),
    end: [
      ...state,
      indicator(connected(host.machineList, machine) ? 'ansi2' : 'dim'),
      icon(folded ? 'chevron-right' : 'chevron-down', 'small'),
    ],
  })
    .id(`machine-${machine ?? 'local'}`)
    .on_click((_event, cx) => {
      host.toggleFold(machine);
      cx.notify();
    });
};

const newSpaceRow = (host: MachineRowsHost, machine: string | null, collapsed: boolean): Element =>
  listRow({
    size: 'small',
    inset: false,
    state: 'normal',
    muted: true,
    start: iconSlot(icon('plus', 'small')),
    label: collapsed ? '' : 'New space there',
  })
    .id(`machine-new-${machine ?? 'local'}`)
    .on_click(() => {
      host.addSpace(machine);
    });

export const machineRows = (host: MachineRowsHost, collapsed: boolean): Element[] => {
  const remote = host.rows
    .map((row) => row.space.machine)
    .filter((machine): machine is string => machine !== null);

  const order = machineGroupOrder(remote, host.machineList);

  if (order.length === 1) {
    const loading = host.loading(null) && host.rows.length === 0;

    return loading ? [loadingRow(collapsed)] : host.rows.map(host.draw);
  }

  return order.flatMap((machine) => {
    const mine = host.rows.filter((row) => (row.space.machine ?? null) === machine);
    const header = machineHeader(host, machine, collapsed);

    if (host.folded(machine)) {
      return [header];
    }

    if (mine.length > 0) {
      return [header].concat(mine.map(host.draw));
    }

    const row = host.loading(machine)
      ? loadingRow(collapsed)
      : newSpaceRow(host, machine, collapsed);

    return [header, row];
  });
};
