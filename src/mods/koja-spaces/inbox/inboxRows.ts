import type { Context, Element } from 'gpui-kit';
import { run, setShared, shared, spaces } from 'herdr';

import { detailText, sectionHeader, sidebarSize } from '../../../kit/index.ts';
import { runSpaceCommand } from '../../../kit/space/spaceSelection.ts';
import { groupedList } from '../groupedList.ts';
import type { InboxGroup } from '../inbox.ts';
import type { ShownRow } from '../projects.ts';
import type { ListedSpace } from '../tree.ts';

export interface InboxRowsHost {
  groups: InboxGroup[];
  loading: boolean;
  draw: (row: ListedSpace, project: string) => Element;
}

const activeSpaceId = (): string | null => spaces().find((space) => space.active)?.id ?? null;

export const selectSpace = (id: string, cx: Context): void => {
  runSpaceCommand(
    { run, get: shared, set: setShared, shown: activeSpaceId },
    { name: 'space.select', args: { id } },
  );

  cx.notify();
};

const groupHeader = (group: InboxGroup): Element =>
  sectionHeader({
    label: group.label,
    size: 'default',
    detail: [detailText(String(group.spaces.length))],
    paddingStart: sidebarSize.rowContentInset,
  }).id(`inbox-${group.id}`);

const inboxRow = (entry: ShownRow, host: InboxRowsHost): Element =>
  host.draw(entry.row, entry.project);

const groupBlock = (group: InboxGroup, host: InboxRowsHost): Element[] => [
  groupHeader(group),
  ...group.spaces.map((entry) => inboxRow(entry, host)),
];

export const inboxRows = (host: InboxRowsHost): Element[] => {
  const blocks = host.groups.map((group) => groupBlock(group, host));

  return groupedList(blocks, host.loading);
};
