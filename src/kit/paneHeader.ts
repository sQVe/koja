import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Program, Status } from 'herdr';

import { iconButton } from './button.ts';
import { icon, programIcon } from './icon.ts';
import type { IconName } from './iconNames.ts';
import type { PaneHeaderFields, PaneHeaderFieldState } from './paneHeaderFields.ts';
import { paneHeaderFields } from './paneHeaderFields.ts';
import { paneActions } from './paneHeaderMenuModel.ts';
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

// While a branch or folder is cut, that field takes the leftover width and the task keeps its own;
// otherwise the task fills the leftover width and cuts at the end, after both fields have left.
const taskElement = (options: PaneHeaderOptions, fieldCut: boolean): Element => {
  if (!isPresent(options.task)) {
    return fieldCut ? h_flex() : h_flex().flex_1();
  }

  const label = div().min_w(0).truncate();

  if (fieldCut) {
    label.flex_none();
  } else {
    label.flex_1();
  }

  return withTextRole(label, 'detail', 'muted').tooltip(options.task).child(options.task);
};

const fieldWidth = (element: Element, state: PaneHeaderFieldState): Element =>
  state === 'cut' ? element.flex_1().min_w(paneHeaderWidth.fieldMinimum) : element.flex_none();

const middleLabel = (text: string): Element =>
  withTextRole(div().min_w(0).flex_1().truncate(), 'detail', 'dim')
    .text_ellipsis_middle()
    .tooltip(text)
    .child(text);

// The branch icon and its text are one field, hidden whole, so the icon never shows without it.
const branchElement = (branch: string, state: PaneHeaderFieldState): Element =>
  fieldWidth(
    h_flex()
      .items_center()
      .gap(spacing.xsmall)
      .child(icon('git-branch', 'small').text_color(colors().dim))
      .child(middleLabel(branch)),
    state,
  );

const folderElement = (folder: string, state: PaneHeaderFieldState): Element =>
  fieldWidth(h_flex().child(middleLabel(folder)), state);

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

const headerButtons = (options: PaneHeaderOptions): Element[] =>
  paneActions(options).map((entry) => headerAction(entry.icon, entry.label, entry.action));

// A drop, or a header below the compact width, replaces the four actions with one overflow
// button that stays visible. Its callback opens the pane menu in the live mod.
const actionRow = (fields: PaneHeaderFields, options: PaneHeaderOptions): Element => {
  if (fields.compact) {
    return h_flex()
      .flex_none()
      .child(headerAction('ellipsis', 'Pane actions', options.onOverflow));
  }

  const row = h_flex().flex_none().gap(spacing.xxsmall).children(headerButtons(options));

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
  const fieldCut = fields.branch === 'cut' || fields.folder === 'cut';

  header.child(taskElement(options, fieldCut));

  if (fields.branch !== 'dropped' && isPresent(options.branch)) {
    header.child(branchElement(options.branch, fields.branch));
  }

  if (fields.folder !== 'dropped' && isPresent(options.folder)) {
    header.child(folderElement(options.folder, fields.folder));
  }

  const status = statusElement(options.status);

  if (status !== null) {
    header.child(status);
  }

  header.child(actionRow(fields, options));

  return header;
};
