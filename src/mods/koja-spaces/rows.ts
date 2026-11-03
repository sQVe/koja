import type { Element } from 'gpui-kit';
import { run } from 'herdr';

import { colors, icon, iconSlot, listRow, shortAge, statusMark } from '../../kit/index.ts';
import type { ListedSpace } from './tree.ts';
import { needsYou } from './tree.ts';

const millisecondsPerSecond = 1000;

export const folderSlot = (open: boolean): Element =>
  iconSlot(icon(open ? 'folder-open' : 'folder')).text_color(colors().dim);

export const labelDetail = (main: ListedSpace): string | undefined => {
  const parts: string[] = [];
  const branch = main.git?.branch;
  const committedAt = main.git?.committedAt;

  if (typeof branch === 'string') {
    parts.push(branch);
  }

  if (typeof committedAt === 'number') {
    parts.push(shortAge(committedAt, Math.floor(Date.now() / millisecondsPerSecond)));
  }

  return parts.length === 0 ? undefined : parts.join(' · ');
};

export const compactRow = (row: ListedSpace): Element => {
  const { space, index } = row;

  return listRow({
    size: 'medium',
    inset: false,
    state: space.active ? 'selected' : 'normal',
    centered: true,
    muted: !space.active,
    label: String(index + 1),
    end: [statusMark(needsYou(space.status) ? space.status : null)],
  })
    .id(`space-${space.id}`)
    .on_click(() => {
      run('space.select', { id: space.id });
    });
};
