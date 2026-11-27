import type { Context, Element } from 'gpui-kit';
import { openOverlay, run, setShared, shared, spaces } from 'herdr';
import type { SpaceInfo } from 'herdr';

import { detailText, overlaySize, sectionHeader, sidebarSize } from '../../../kit/index.ts';
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

const selectSpace = (id: string, cx: Context): void => {
  runSpaceCommand(
    { run, get: shared, set: setShared, shown: activeSpaceId },
    { name: 'space.select', args: { id } },
  );

  cx.notify();
};

const openSpaceMenu = (space: SpaceInfo): void => {
  openOverlay({
    mod: 'koja-menu',
    kind: 'popup',
    width: overlaySize.menuWidth,
    height: overlaySize.menuHeight,
    props: { tab: 'space', target: { id: space.id } },
  });
};

const groupHeader = (group: InboxGroup): Element =>
  sectionHeader({
    label: group.label,
    size: 'default',
    detail: [detailText(String(group.spaces.length))],
    paddingStart: sidebarSize.rowContentInset,
  }).id(`inbox-${group.id}`);

const inboxRow = (entry: ShownRow, host: InboxRowsHost): Element =>
  host
    .draw(entry.row, entry.project)
    .on_click((_event, cx) => {
      selectSpace(entry.row.space.id, cx);
    })
    .on_mouse_down('right', () => {
      openSpaceMenu(entry.row.space);
    });

const groupBlock = (group: InboxGroup, host: InboxRowsHost): Element[] => [
  groupHeader(group),
  ...group.spaces.map((entry) => inboxRow(entry, host)),
];

export const inboxRows = (host: InboxRowsHost): Element[] => {
  const blocks = host.groups.map((group) => groupBlock(group, host));

  return groupedList(blocks, host.loading);
};
