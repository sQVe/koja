import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { PaneInfo, Program, SpaceInfo, Status } from 'herdr';

import type { TextRole } from '../../kit/index.ts';
import {
  colors,
  modName,
  paneBranchElement,
  programIcon,
  roleText,
  spacing,
  statusMark,
  withTextRole,
} from '../../kit/index.ts';
import type { PickerData } from './rows.ts';
import { paneFacts } from './spaceFacts.ts';

// Herdr leaves branch and status out of a mod pane's record, so the header keeps only what it
// draws, narrowed to the types it draws with. It leaves program out too, and the pane's declared
// type does not say so, which is why programIcon reads a missing program as the terminal icon.
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

const targetOf = (data: PickerData, space: SpaceInfo, pane: PaneInfo): PreviewTarget => {
  const branch = textOf(pane.branch);

  // A pane the data layer has not read falls back to its space's facts, so a pane in an unobserved
  // worktree of the same repository still names its branch's pull.
  const facts = paneFacts(data.stored, space.machine, pane, branch) ?? data.facts[space.id] ?? null;
  const pull = facts === null ? null : facts.pull;

  return {
    spaceName: space.name,
    paneTitle: typeof pane.title === 'string' ? pane.title : '',
    program: pane.program,
    branch,
    status: pane.status ?? null,
    pull,
  };
};

export const previewTargetOf = (data: PickerData, paneId: string | null): PreviewTarget | null => {
  const pane = data.panes.find((entry) => entry.pane === paneId);

  if (pane === undefined) {
    return null;
  }

  const space = data.spaces.find((entry) => entry.tabs.some((tab) => tab.id === pane.tab));

  return space === undefined ? null : targetOf(data, space, pane);
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
    header.child(paneBranchElement(target.branch, 'full', false));
  }

  const mark = statusMark(target.status);

  header.child(mark);

  if (target.pull !== null) {
    header.child(fullLabel('detail', `#${target.pull}`, 'dim'));
  }

  return header;
};
