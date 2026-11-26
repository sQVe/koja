import { h_flex, v_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { actionButton } from './button.ts';
import { withHover } from './hover.ts';
import { icon } from './icon.ts';
import type { ThemeToken } from './palette.ts';
import { controlSize, radius, spacing } from './size.ts';
import type { TextRole } from './textRole.ts';
import { withTextRole } from './textRole.ts';
import { colors } from './theme.ts';

export interface ActionRecovery {
  label: string;
  onSelect: (cx: Context) => void;
}

export interface ActionFailure {
  error: string;
  // The folder the save failed on, shown on its own line below the error.
  folder: string;
  // The small secondary buttons, such as Copy path.
  recovery: ActionRecovery[];
  // What the pane still holds, such as the unsaved count.
  unsaved: string;
  // Why the main action waits, drawn dim after the unsaved count.
  wait: string;
}

export type ActionBlockOptions =
  | { kind: 'ready'; action: string; onAction: (cx: Context) => void }
  | { kind: 'failed'; action: string; onAction: (cx: Context) => void; failure: ActionFailure }
  | { kind: 'sent'; action: string; detail: string };

const textLine = (role: TextRole, text: string, color?: ThemeToken): Element => {
  const box = div().min_w(0);

  return withTextRole(box, role, color).child(text);
};

const folderText = (folder: string): Element => {
  const box = div().min_w(0).truncate().text_ellipsis_middle().tooltip(folder);

  return withTextRole(box, 'detail', 'foreground').child(folder);
};

const errorRow = (failure: ActionFailure): Element => {
  const alert = icon('circle-alert', 'small')
    .flex_none()
    .mt(spacing.xxsmall)
    .text_color(colors().blocked);

  const messages = v_flex()
    .min_w(0)
    .flex_1()
    .gap(spacing.xsmall)
    .child(textLine('detail', failure.error, 'foreground'))
    .child(folderText(failure.folder));

  return h_flex().min_w(0).gap(spacing.small).items_start().child(alert).child(messages);
};

const recoveryButton = (recovery: ActionRecovery): Element => {
  const palette = colors();

  const chip = h_flex()
    .h(controlSize.button)
    .px(spacing.small)
    .flex_none()
    .items_center()
    .rounded(radius.pill)
    .cursor_pointer()
    .border(spacing.hairline)
    .border_color(palette.border);

  const button = withTextRole(chip, 'detail', 'muted');

  const outlined = withHover(button, false, (element) =>
    element.bg(palette.hover).text_color(palette.foreground),
  );

  return outlined.child(recovery.label).on_click((_event, cx) => {
    recovery.onSelect(cx);
  });
};

const failureBlock = (failure: ActionFailure): Element => {
  const block = v_flex().min_w(0).gap(spacing.medium).child(errorRow(failure));

  if (failure.recovery.length > 0) {
    const recovery = h_flex().gap(spacing.small).children(failure.recovery.map(recoveryButton));

    block.child(recovery);
  }

  return block
    .child(textLine('body', failure.unsaved))
    .child(textLine('detail', failure.wait, 'dim'));
};

const mainButton = (action: string, onAction: (cx: Context) => void): Element =>
  actionButton({ label: action, enabled: true }).on_click((_event, cx) => {
    onAction(cx);
  });

const sentRow = (action: string): Element => {
  const check = icon('check', 'small').text_color(colors().done);
  const label = textLine('body', action);

  return h_flex().gap(spacing.small).items_center().child(check).child(label);
};

export const actionBlock = (options: ActionBlockOptions): Element => {
  const block = v_flex().min_w(0).gap(spacing.medium);

  if (options.kind === 'sent') {
    return block.child(sentRow(options.action)).child(textLine('body', options.detail));
  }

  block.child(mainButton(options.action, options.onAction));

  if (options.kind === 'failed') {
    block.child(failureBlock(options.failure));
  }

  return block;
};
