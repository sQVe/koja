import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import {
  detailText,
  icon,
  iconButton,
  iconSlot,
  indicator,
  listRow,
  sectionHeader,
  spacing,
  stateLine,
} from '../../kit/index.ts';
import type { Machine } from './machines.ts';
import { machineGroupOrder } from './machines.ts';
import type { TreeGroup, TreeRow } from './tree.ts';
import { groupGapBefore, groupRows, machineOfGroup, railLineBefore } from './tree.ts';

export interface MachineRowsHost {
  machineList: Machine[];
  groups: TreeGroup[];
  draw: (row: TreeRow, lineAbove: boolean) => Element;
  folded: (machine: string | null) => boolean;
  loading: (machine: string | null) => boolean;
  addSpace: (machine: string | null) => void;
  toggleFold: (machine: string | null) => void;
}

const connected = (machineList: Machine[], machine: string | null): boolean =>
  machine === null ||
  machineList.find((candidate) => candidate.name === machine)?.state === 'connected';

const loadingRow = (collapsed: boolean): Element =>
  stateLine({ kind: 'loading', text: collapsed ? '…' : 'Loading…' });

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
    inset: true,
    state: 'normal',
    muted: true,
    start: iconSlot(icon('plus', 'small')),
    label: collapsed ? '' : 'New space there',
  })
    .id(`machine-new-${machine ?? 'local'}`)
    .on_click(() => {
      host.addSpace(machine);
    });

const groupGap = (): Element => div().h(spacing.medium);

const groupChildren = (
  host: MachineRowsHost,
  groups: TreeGroup[],
  collapsed: boolean,
): Element[] => {
  const elements: Element[] = [];

  groups.forEach((group, index) => {
    const previous = groups[index - 1] ?? null;

    if (!collapsed && groupGapBefore(group, previous)) {
      elements.push(groupGap());
    }

    const lineAbove = railLineBefore(group, previous);
    const rows = groupRows(group);

    rows.forEach((row, rowIndex) => {
      elements.push(host.draw(row, lineAbove && rowIndex === 0));
    });
  });

  return elements;
};

export const machineRows = (host: MachineRowsHost, collapsed: boolean): Element[] => {
  const remote = host.groups
    .map((group) => machineOfGroup(group))
    .filter((machine): machine is string => machine !== null);

  const order = machineGroupOrder(remote, host.machineList);

  if (order.length === 1) {
    const loading = host.loading(null) && host.groups.length === 0;

    return loading ? [loadingRow(collapsed)] : groupChildren(host, host.groups, collapsed);
  }

  return order.flatMap((machine) => {
    const mine = host.groups.filter((group) => machineOfGroup(group) === machine);
    const header = machineHeader(host, machine, collapsed);

    if (host.folded(machine)) {
      return [header];
    }

    if (mine.length > 0) {
      return [header].concat(groupChildren(host, mine, collapsed));
    }

    const row = host.loading(machine)
      ? loadingRow(collapsed)
      : newSpaceRow(host, machine, collapsed);

    return [header, row];
  });
};
