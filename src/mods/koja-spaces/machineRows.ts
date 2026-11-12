import type { Context, Element } from 'gpui-kit';
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
  toggleButton,
} from '../../kit/index.ts';
import type { Machine } from './machines.ts';
import { machineGroupOrder } from './machines.ts';
import { railErrorMark } from './rail.ts';
import type { GitInfo, TreeGroup, TreeRow } from './tree.ts';
import { gitOfGroup, groupGapBefore, groupRows, machineOfGroup, railLineBefore } from './tree.ts';

export interface MachineRowsHost {
  machineList: Machine[];
  groups: TreeGroup[];
  draw: (row: TreeRow, lineAbove: boolean) => Element;
  folded: (machine: string | null) => boolean;
  loading: (machine: string | null) => boolean;
  addSpace: (machine: string | null) => void;
  toggleFold: (machine: string | null) => void;
  machineError: () => string | null;
  pullError: (git: GitInfo | null) => string | null;
  retryMachines: (cx: Context) => void;
  retryPull: (git: GitInfo | null, cx: Context) => void;
}

export type ShownRowsHost = Pick<MachineRowsHost, 'machineList' | 'groups' | 'folded'>;

interface MachineSection {
  machine: string | null;
  headed: boolean;
  folded: boolean;
  groups: TreeGroup[];
}

const connected = (machineList: Machine[], machine: string | null): boolean =>
  machine === null ||
  machineList.find((candidate) => candidate.name === machine)?.state === 'connected';

const loadingRow = (collapsed: boolean): Element =>
  stateLine({ kind: 'loading', text: collapsed ? '…' : 'Loading…' });

const errorRow = (text: string, retry: (cx: Context) => void): Element =>
  stateLine({
    kind: 'error',
    text,
    action: toggleButton({ label: 'Retry', active: false }).on_click((_event, cx) => {
      cx.stop_propagation();
      retry(cx);
    }),
  });

// A remote machine's state comes from the machine list, so a failed read leaves it unknown.
const staleRemote = (host: MachineRowsHost, machine: string | null): boolean =>
  machine !== null && host.machineError() !== null;

const machineState = (host: MachineRowsHost, machine: string | null): Element | null => {
  if (staleRemote(host, machine)) {
    return null;
  }

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
  const state = collapsed ? null : machineState(host, machine);
  const label = collapsed ? '' : (machine ?? 'This computer');

  return sectionHeader({
    label,
    size: 'default',
    interactive: true,
    start: icon(machine === null ? 'monitor' : 'server', 'small'),
    end: [
      ...(state === null ? [] : [state]),
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

const newSpaceRow = (
  host: MachineRowsHost,
  machine: string | null,
  collapsed: boolean,
): Element => {
  const stale = staleRemote(host, machine);

  const row = listRow({
    size: 'small',
    inset: true,
    state: stale ? 'disabled' : 'normal',
    muted: true,
    start: iconSlot(icon('plus', 'small')),
    label: collapsed ? '' : 'New space there',
  }).id(`machine-new-${machine ?? 'local'}`);

  if (!stale) {
    row.on_click(() => {
      host.addSpace(machine);
    });
  }

  return row;
};

const groupGap = (): Element => div().h(spacing.medium);

const groupChildren = (
  host: MachineRowsHost,
  groups: TreeGroup[],
  collapsed: boolean,
): Element[] => {
  const elements: Element[] = [];
  const reposWithError = new Set<string>();

  groups.forEach((group, index) => {
    const previous = groups[index - 1] ?? null;

    if (!collapsed && groupGapBefore(group, previous)) {
      elements.push(groupGap());
    }

    const lineAbove = railLineBefore(group, previous);
    const rows = groupRows(group);
    const git = gitOfGroup(group);
    const repoKey = git?.repo.key ?? '';
    const skipError = collapsed || reposWithError.has(repoKey);
    const error = skipError ? null : host.pullError(git);

    if (error !== null) {
      reposWithError.add(repoKey);
    }

    rows.forEach((row, rowIndex) => {
      elements.push(host.draw(row, lineAbove && rowIndex === 0));

      if (rowIndex === 0 && error !== null) {
        elements.push(
          errorRow(error, (cx) => {
            host.retryPull(git, cx);
          }),
        );
      }
    });
  });

  return elements;
};

const machineErrorRow = (
  text: string,
  collapsed: boolean,
  retry: (cx: Context) => void,
): Element => (collapsed ? railErrorMark(text, retry) : errorRow(text, retry));

const machineSections = (host: ShownRowsHost): MachineSection[] => {
  const remote = host.groups
    .map((group) => machineOfGroup(group))
    .filter((machine): machine is string => machine !== null);

  const order = machineGroupOrder(remote, host.machineList);

  // With one machine there is no header, so there is nothing to fold.
  if (order.length === 1) {
    return [{ machine: null, headed: false, folded: false, groups: host.groups }];
  }

  return order.map((machine) => ({
    machine,
    headed: true,
    folded: host.folded(machine),
    groups: host.groups.filter((group) => machineOfGroup(group) === machine),
  }));
};

export const shownRows = (host: ShownRowsHost): TreeRow[] =>
  machineSections(host)
    .filter((section) => !section.folded)
    .flatMap((section) => section.groups.flatMap(groupRows));

const sectionRows = (
  host: MachineRowsHost,
  section: MachineSection,
  collapsed: boolean,
): Element[] => {
  if (section.folded) {
    return [];
  }

  if (section.groups.length > 0) {
    return groupChildren(host, section.groups, collapsed);
  }

  if (host.loading(section.machine)) {
    return [loadingRow(collapsed)];
  }

  return section.headed ? [newSpaceRow(host, section.machine, collapsed)] : [];
};

export const machineRows = (host: MachineRowsHost, collapsed: boolean): Element[] => {
  const error = host.machineError();
  const head = error === null ? [] : [machineErrorRow(error, collapsed, host.retryMachines)];

  const rows = machineSections(host).flatMap((section) => {
    const header = section.headed ? [machineHeader(host, section.machine, collapsed)] : [];

    return header.concat(sectionRows(host, section, collapsed));
  });

  return head.concat(rows);
};
