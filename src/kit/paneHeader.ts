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
import { roleBadge } from './roleBadge.ts';
import { controlSize, paneHeaderWidth, radius, spacing } from './size.ts';
import { paneStatusElement, statusMarkWidth } from './statusMark.ts';
import { withTextRole } from './textRole.ts';
import { colors, focusFill } from './theme.ts';

export interface PaneHeaderOptions {
  program: Program | null;
  name: string;
  role?: string;
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

interface TrailingAlignment {
  branch: boolean;
  folder: boolean;
  status: boolean;
  action: boolean;
}

const isPresent = (text: string | undefined): text is string => text !== undefined && text !== '';

const nameElement = (options: PaneHeaderOptions): Element => {
  const box = div().flex_none().min_w(0).max_w(controlSize.paneLabelMaxWidth).truncate();
  const color = options.focused ? 'foreground' : 'muted';

  return withTextRole(box, 'detail', color).child(options.name);
};

// While a branch or folder is cut, that field takes the leftover width and the task keeps its own;
// otherwise the task fills the leftover width and cuts at the end, after both fields have left.
export const paneTaskElement = (task: string | undefined, fieldCut: boolean): Element | null => {
  if (!isPresent(task)) {
    return null;
  }

  const label = div().min_w(0).truncate();

  if (fieldCut) {
    label.flex_none();
  } else {
    label.flex_1();
  }

  return withTextRole(label, 'detail', 'muted').tooltip(task).child(task);
};

const fieldWidth = (
  element: Element,
  state: PaneHeaderFieldState,
  endAligned: boolean,
): Element => {
  if (state === 'cut') {
    return element.flex_1().min_w(paneHeaderWidth.fieldMinimum);
  }

  return endAligned ? element.flex_none().ml_auto() : element.flex_none();
};

const middleLabel = (text: string): Element => {
  const box = div().min_w(0).flex_1().truncate();

  return withTextRole(box, 'detail', 'dim').text_ellipsis_middle().tooltip(text).child(text);
};

export const paneBranchElement = (
  branch: string,
  state: PaneHeaderFieldState,
  endAligned: boolean,
): Element => {
  const branchIcon = icon('git-branch', 'small').text_color(colors().dim);

  const field = h_flex()
    .items_center()
    .gap(spacing.xsmall)
    .child(branchIcon)
    .child(middleLabel(branch));

  return fieldWidth(field, state, endAligned);
};

export const paneFolderElement = (
  folder: string,
  state: PaneHeaderFieldState,
  endAligned: boolean,
): Element => {
  const field = h_flex().child(middleLabel(folder));

  return fieldWidth(field, state, endAligned);
};

const headerAction = (name: IconName, label: string, action: (() => void) | undefined): Element =>
  iconButton({ name })
    .accessibility_label(label)
    .tooltip(label)
    .on_click((_event, cx) => {
      cx.stop_propagation();
      action?.();
    });

/** @public */
export const paneOverflowButton = (onOverflow: (() => void) | undefined): Element =>
  headerAction('ellipsis', 'Pane actions', onOverflow);

const headerButtons = (options: PaneHeaderOptions): Element[] =>
  paneActions(options).map((entry) => headerAction(entry.icon, entry.label, entry.action));

const trailingAlignment = (
  hasTask: boolean,
  showsBranch: boolean,
  showsFolder: boolean,
  showsStatus: boolean,
): TrailingAlignment => {
  if (hasTask) {
    return { branch: false, folder: false, status: false, action: false };
  }

  if (showsBranch) {
    return { branch: true, folder: false, status: false, action: false };
  }

  if (showsFolder) {
    return { branch: false, folder: true, status: false, action: false };
  }

  if (showsStatus) {
    return { branch: false, folder: false, status: true, action: false };
  }

  return { branch: false, folder: false, status: false, action: true };
};

const trailingChildren = (
  options: PaneHeaderOptions,
  fields: PaneHeaderFields,
  status: Element | null,
  alignment: TrailingAlignment,
): Element[] => {
  const children: Element[] = [];
  const branch = options.branch;
  const folder = options.folder;

  if (isPresent(branch) && fields.branch !== 'dropped') {
    children.push(paneBranchElement(branch, fields.branch, alignment.branch));
  }

  if (isPresent(folder) && fields.folder !== 'dropped') {
    children.push(paneFolderElement(folder, fields.folder, alignment.folder));
  }

  if (status !== null) {
    const placedStatus = alignment.status ? status.ml_auto() : status;

    children.push(placedStatus);
  }

  return children;
};

const actionRow = (
  fields: PaneHeaderFields,
  options: PaneHeaderOptions,
  endAligned: boolean,
): Element => {
  if (fields.compact) {
    const compact = h_flex().flex_none().child(paneOverflowButton(options.onOverflow));

    return endAligned ? compact.ml_auto() : compact;
  }

  const row = h_flex().flex_none().gap(spacing.xxsmall).children(headerButtons(options));

  if (endAligned) {
    row.ml_auto();
  }

  return options.hovered === true ? row : row.invisible();
};

export const paneHeader = (options: PaneHeaderOptions): Element => {
  const palette = colors();
  const fields = paneHeaderFields({ ...options, statusWidth: statusMarkWidth(options.status) });
  const iconColor = options.focused ? palette.muted : palette.dim;

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

  const programMark = programIcon(options.program, 'default').text_color(iconColor);

  header.child(programMark);
  header.child(nameElement(options));

  if (isPresent(options.role)) {
    header.child(roleBadge(options.role, fields.role));
  }

  const fieldCut = fields.branch === 'cut' || fields.folder === 'cut';
  const hasTask = fields.task === 'shown';
  const showsBranch = fields.branch !== 'dropped' && isPresent(options.branch);
  const showsFolder = fields.folder !== 'dropped' && isPresent(options.folder);
  const status = paneStatusElement(options.status);
  const alignment = trailingAlignment(hasTask, showsBranch, showsFolder, status !== null);

  const task = hasTask ? paneTaskElement(options.task, fieldCut) : null;

  if (task !== null) {
    header.child(task);
  }

  header.children(trailingChildren(options, fields, status, alignment));
  header.child(actionRow(fields, options, alignment.action));

  return header;
};
