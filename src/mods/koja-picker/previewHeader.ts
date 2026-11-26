import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { PaneInfo, Program, SpaceInfo, Status } from 'herdr';

import type { TextRole } from '../../kit/index.ts';
import {
  colors,
  icon,
  modName,
  programIcon,
  roleText,
  spacing,
  statusMark,
  withTextRole,
} from '../../kit/index.ts';
import type { PickerData } from './rows.ts';
import { paneFacts } from './spaceFacts.ts';

// Herdr leaves branch, status, and program out of a mod pane's record, so the header keeps only
// what it draws, already narrowed to the types it draws with.
export interface PreviewTarget {
  spaceName: string;
  paneTitle: string;
  program: Program | null;
  branch: string | null;
  status: Status | null;
  pull: number | null;
}

const textOf = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const targetOf = (space: SpaceInfo, pane: PaneInfo): PreviewTarget => {
  const branch = textOf(pane.branch);
  const facts = paneFacts(space.machine, pane, branch);

  return {
    spaceName: space.name,
    paneTitle: typeof pane.title === 'string' ? pane.title : '',
    program: pane.program,
    branch,
    status: pane.status ?? null,
    pull: facts?.pull ?? null,
  };
};

export const previewTargetOf = (data: PickerData, paneId: string | null): PreviewTarget | null => {
  const pane = data.panes.find((entry) => entry.pane === paneId);

  if (pane === undefined) {
    return null;
  }

  const space = data.spaces.find((entry) => entry.tabs.some((tab) => tab.id === pane.tab));

  return space === undefined ? null : targetOf(space, pane);
};

const fullLabel = (role: TextRole, text: string, ink: 'foreground' | 'muted' | 'dim'): Element => {
  const box = h_flex().flex_none();

  return withTextRole(box, role, ink).child(text);
};

// The header names the target the selected row goes to: the space, then the pane, the whole
// branch, the pane's status, and the pull request of that same branch.
export const previewHeader = (target: PreviewTarget | null): Element => {
  const header = h_flex()
    .id(`${modName}-preview-header`)
    .size_full()
    .min_w(0)
    .px(spacing.large)
    .gap(spacing.small)
    .items_center()
    .overflow_hidden()
    .border_b(spacing.hairline)
    .border_color(colors().border);

  if (target === null) {
    return header;
  }

  const spaceName = roleText('title', target.spaceName);
  const paneMark = programIcon(target.program, 'small').text_color(colors().muted);
  const paneName = roleText('detail', target.paneTitle, 'muted');

  header.child(spaceName);
  header.child(paneMark);
  header.child(paneName);

  if (target.branch !== null) {
    const branchIcon = icon('git-branch', 'small').text_color(colors().dim);
    const branchName = fullLabel('detail', target.branch, 'dim');

    const branch = h_flex()
      .flex_none()
      .gap(spacing.xsmall)
      .items_center()
      .child(branchIcon)
      .child(branchName);

    header.child(branch);
  }

  const mark = statusMark(target.status);

  header.child(mark);

  if (target.pull !== null) {
    header.child(fullLabel('detail', `#${target.pull}`, 'dim'));
  }

  return header;
};
