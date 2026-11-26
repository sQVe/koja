import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { PaneInfo, SpaceInfo } from 'herdr';

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
import type { SpaceFacts } from './spaceFacts.ts';

interface PreviewTarget {
  space: SpaceInfo;
  pane: PaneInfo;
}

export const previewTargetOf = (data: PickerData, paneId: string | null): PreviewTarget | null => {
  const pane = data.panes.find((entry) => entry.pane === paneId);

  if (pane === undefined) {
    return null;
  }

  const space = data.spaces.find((entry) => entry.tabs.some((tab) => tab.id === pane.tab));

  return space === undefined ? null : { space, pane };
};

const fullLabel = (role: TextRole, text: string, ink: 'foreground' | 'muted' | 'dim'): Element => {
  const box = h_flex().flex_none();

  return withTextRole(box, role, ink).child(text);
};

// The header names the target the selected row goes to: the space, then the pane, the whole
// branch, the pane's status, and the space's pull request.
export const previewHeader = (
  target: PreviewTarget | null,
  facts: Record<string, SpaceFacts>,
): Element => {
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

  const { space, pane } = target;
  const pull = facts[space.id]?.pull ?? null;
  const spaceName = roleText('title', space.name);
  const paneMark = programIcon(pane.program, 'small').text_color(colors().muted);
  const paneName = roleText('detail', pane.title, 'muted');

  header.child(spaceName);
  header.child(paneMark);
  header.child(paneName);

  if (pane.branch !== null && pane.branch !== '') {
    const branchIcon = icon('git-branch', 'small').text_color(colors().dim);
    const branchName = fullLabel('detail', pane.branch, 'dim');

    const branch = h_flex()
      .flex_none()
      .gap(spacing.xsmall)
      .items_center()
      .child(branchIcon)
      .child(branchName);

    header.child(branch);
  }

  const mark = statusMark(pane.status);

  header.child(mark);

  if (pull !== null) {
    header.child(fullLabel('detail', `#${pull}`, 'dim'));
  }

  return header;
};
