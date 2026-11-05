import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Program, Status } from 'herdr';

import { iconButton } from './button.ts';
import { icon, programIcon } from './icon.ts';
import type { IconName } from './iconNames.ts';
import type { PaneHeaderFields } from './paneHeaderFields.ts';
import { paneHeaderFields } from './paneHeaderFields.ts';
import { controlSize, paneHeaderWidth, radius, spacing } from './size.ts';
import { attentionBadge, statusMark } from './statusMark.ts';
import { withTextRole } from './textRole.ts';
import { colors, focusFill } from './theme.ts';

export interface PaneHeaderOptions {
  program: Program | null;
  name: string;
  task?: string;
  branch?: string;
  folder?: string;
  status: Status | null;
  focused: boolean;
  hovered?: boolean;
  zoomed: boolean;
  width?: number | null;
  onHoverChange?: (hovered: boolean) => void;
  onWidthChange?: (width: number) => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
  onZoom?: () => void;
  onClose?: () => void;
  onOverflow?: () => void;
}

const isPresent = (text: string | undefined): text is string => text !== undefined && text !== '';

const nameElement = (options: PaneHeaderOptions): Element =>
  withTextRole(
    div().flex_none().min_w(0).max_w(controlSize.paneLabelMaxWidth).truncate(),
    'detail',
    options.focused ? 'foreground' : 'muted',
  ).child(options.name);

// The task is the flexible field: it fills the leftover width and cuts at the end, so it gives up
// text last, after the folder and the branch have left.
const taskElement = (options: PaneHeaderOptions): Element => {
  if (!isPresent(options.task)) {
    return h_flex().flex_1();
  }

  return withTextRole(div().flex_1().min_w(0).truncate(), 'detail', 'muted')
    .tooltip(options.task)
    .child(options.task);
};

const middleLabel = (text: string, maxWidth: number): Element =>
  withTextRole(div().flex_none().min_w(0).max_w(maxWidth).truncate(), 'detail', 'dim')
    .text_ellipsis_middle()
    .tooltip(text)
    .child(text);

// The branch icon and its text are one field, hidden whole, so the icon never shows without it.
const branchElement = (branch: string): Element =>
  h_flex()
    .flex_none()
    .min_w(0)
    .items_center()
    .gap(spacing.xsmall)
    .child(icon('git-branch', 'small').text_color(colors().dim))
    .child(middleLabel(branch, paneHeaderWidth.branchLabel));

const statusElement = (status: Status | null): Element | null => {
  if (status === 'blocked') {
    return attentionBadge('Needs you');
  }

  if (status === 'working' || status === 'done') {
    return statusMark(status);
  }

  return null;
};

const headerAction = (name: IconName, label: string, action: (() => void) | undefined): Element =>
  iconButton({ name })
    .accessibility_label(label)
    .tooltip(label)
    .on_click((_event, cx) => {
      cx.stop_propagation();
      action?.();
    });

const headerButtons = (options: PaneHeaderOptions): Element[] => {
  const zoomIcon: IconName = options.zoomed ? 'minimize-2' : 'maximize-2';
  const zoomLabel = options.zoomed ? 'Restore pane' : 'Zoom pane';

  return [
    headerAction('columns-2', 'Split right', options.onSplitRight),
    headerAction('rows-2', 'Split down', options.onSplitDown),
    headerAction(zoomIcon, zoomLabel, options.onZoom),
    headerAction('x', 'Close pane', options.onClose),
  ];
};

// Below the compact width, one reserved overflow button replaces the four. Its callback opens the
// pane menu in the live mod.
const actionRow = (fields: PaneHeaderFields, options: PaneHeaderOptions): Element => {
  const buttons = fields.compact
    ? [headerAction('ellipsis', 'Pane actions', options.onOverflow)]
    : headerButtons(options);

  const row = h_flex().flex_none().gap(spacing.xxsmall).children(buttons);

  return options.hovered === true ? row : row.invisible();
};

export const paneHeader = (options: PaneHeaderOptions): Element => {
  const palette = colors();
  const fields = paneHeaderFields(options);
  const iconColor = options.focused ? palette.muted : palette.dim;

  // The header owns the hover and width reports, so hovering anywhere on it reveals the actions.
  const header = h_flex()
    .h(controlSize.sectionHeader)
    .flex_none()
    .px(spacing.large)
    .gap(spacing.medium)
    .items_center()
    .overflow_hidden()
    .border_b(spacing.hairline)
    .border_color(palette.selected)
    .on_hover((hovered) => {
      options.onHoverChange?.(hovered);
    })
    .on_size_change((size) => {
      options.onWidthChange?.(size.width);
    });

  if (options.focused) {
    header.bg(focusFill()).rounded_t(radius.cardInner);
  }

  header.child(programIcon(options.program, 'default').text_color(iconColor));
  header.child(nameElement(options));
  header.child(taskElement(options));

  if (fields.branch && isPresent(options.branch)) {
    header.child(branchElement(options.branch));
  }

  if (fields.folder && isPresent(options.folder)) {
    header.child(middleLabel(options.folder, paneHeaderWidth.folderLabel));
  }

  const status = statusElement(options.status);

  if (status !== null) {
    header.child(status);
  }

  header.child(actionRow(fields, options));

  return header;
};
