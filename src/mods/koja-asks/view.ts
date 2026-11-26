import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import {
  askCardSize,
  colors,
  controlSize,
  icon,
  iconButton,
  overlayCard,
  radius,
  roleText,
  spacing,
  terminalFont,
  withTextRole,
} from '../../kit/index.ts';
import type { Ask } from './askFacts.ts';
import type { AskRow, CardMore } from './card.ts';
import { listTitle, moreText, rowDetail, rowMeta } from './card.ts';

export interface CardActions {
  goToAsk: () => void;
  dismiss: () => void;
  openList: () => void;
  goToRow: (ask: Ask) => void;
  dismissList: () => void;
}

const { textInset, bodyLineHeight, terminalLineHeight, detailLineHeight } = askCardSize;

const listLineHeight = controlSize.button;

const listGap = spacing.medium;

const stopPress = (_event: unknown, cx: { stop_propagation: () => void }): void => {
  cx.stop_propagation();
};

const closeButton = (id: string, label: string, actions: () => void): Element =>
  iconButton({ name: 'x' })
    .id(id)
    .accessibility_label(label)
    .on_mouse_down('left', stopPress)
    .on_click((_event, cx) => {
      cx.stop_propagation();
      actions();
    });

const titleRow = (ask: Ask, actions: CardActions): Element => {
  const mark = icon('message-circle-question', 'small').text_color(colors().blocked);
  const spaceLabel = roleText('title', ask.spaceName).flex_none();
  const agentLabel = roleText('detail', ask.agent, 'dim').flex_1();

  return h_flex()
    .h(controlSize.button)
    .gap(spacing.small)
    .items_center()
    .child(mark)
    .child(spaceLabel)
    .child(agentLabel)
    .child(
      closeButton('koja-ask-dismiss', 'Dismiss the ask', () => {
        actions.dismiss();
      }),
    );
};

const wrappedLine = (text: string): Element => {
  const box = div()
    .w_full()
    .min_w(0)
    .flex_none()
    .ml(textInset)
    .whitespace_normal()
    .line_height(`${bodyLineHeight}px`);

  return withTextRole(box, 'body').child(text);
};

const commandLine = (command: string): Element => {
  const box = div()
    .w_full()
    .min_w(0)
    .flex_none()
    .ml(textInset)
    .whitespace_normal()
    .line_height(`${terminalLineHeight}px`)
    .font_family(terminalFont());

  return withTextRole(box, 'body').child(command);
};

const moreLine = (more: CardMore, actions: CardActions): Element => {
  const box = div()
    .ml(textInset)
    .min_w(0)
    .line_height(`${detailLineHeight}px`)
    .overflow_hidden()
    .truncate();

  const text = withTextRole(box, 'detail', 'muted').child(moreText(more));
  const chevron = icon('chevron-right', 'small').text_color(colors().muted);

  return h_flex()
    .id('koja-ask-more')
    .gap(spacing.xxsmall)
    .items_center()
    .cursor_pointer()
    .on_mouse_down('left', stopPress)
    .on_click((_event, cx) => {
      cx.stop_propagation();
      actions.openList();
    })
    .child(text)
    .child(chevron);
};

const cardChildren = (ask: Ask, more: CardMore | null, actions: CardActions): Element[] => {
  const title = titleRow(ask, actions);
  const question = wrappedLine(ask.question);
  const children = [title, question];

  if (ask.command !== null) {
    const command = commandLine(ask.command);

    children.push(command);
  }

  if (more !== null) {
    const moreRow = moreLine(more, actions);

    children.push(moreRow);
  }

  return children;
};

export const cardElement = (ask: Ask, more: CardMore | null, actions: CardActions): Element => {
  const card = overlayCard('koja-ask-card')
    .gap(spacing.small)
    .cursor_pointer()
    .on_mouse_down('left', stopPress)
    .on_click(() => {
      actions.goToAsk();
    })
    .children(cardChildren(ask, more, actions));

  return v_flex().id('koja-asks').size_full().justify_end().child(card);
};

const listTitleRow = (rows: readonly AskRow[], actions: CardActions): Element => {
  const box = div().min_w(0).flex_1().truncate();
  const text = listTitle(rows.length);
  const title = withTextRole(box, 'title').child(text);

  const dismiss = closeButton('koja-ask-list-dismiss', 'Dismiss the asks', () => {
    actions.dismissList();
  });

  return h_flex()
    .h(listLineHeight)
    .pl(spacing.medium)
    .pr(spacing.xsmall)
    .items_center()
    .child(title)
    .child(dismiss);
};

const rowTitleLine = (row: AskRow): Element => {
  const mark = icon('message-circle-question', 'small').text_color(colors().blocked);

  const box = div().min_w(0).flex_1().truncate().line_height(`${listLineHeight}px`);
  const spaceLabel = withTextRole(box, 'title').child(row.ask.spaceName);

  const meta = roleText('detail', rowMeta(row), 'dim').flex_none();

  return h_flex()
    .h(listLineHeight)
    .gap(spacing.small)
    .items_center()
    .child(mark)
    .child(spaceLabel)
    .child(meta);
};

const rowDetailLine = (row: AskRow): Element => {
  const box = div()
    .w_full()
    .min_w(0)
    .flex_none()
    .ml(textInset)
    .whitespace_normal()
    .line_height(`${bodyLineHeight}px`);

  return withTextRole(box, 'body', 'muted').child(rowDetail(row));
};

const rowElement = (row: AskRow, actions: CardActions): Element => {
  const element = v_flex()
    .flex_none()
    .px(spacing.medium)
    .py(spacing.small)
    .gap(spacing.xxsmall)
    .rounded(radius.pill)
    .cursor_pointer()
    .hover((box) => box.bg(colors().hover))
    .on_mouse_down('left', stopPress)
    .on_click(() => {
      actions.goToRow(row.ask);
    })
    .child(rowTitleLine(row))
    .child(rowDetailLine(row));

  if (row.ask.command !== null) {
    element.child(commandLine(row.ask.command));
  }

  return element;
};

export const listElement = (rows: readonly AskRow[], actions: CardActions): Element => {
  const body = v_flex()
    .id('koja-ask-list-rows')
    .flex_1()
    .min_h(0)
    .gap(listGap)
    .overflow_y_scrollbar()
    .children(rows.map((row) => rowElement(row, actions)));

  const column = v_flex()
    .flex_1()
    .min_h(0)
    .gap(listGap)
    .child(listTitleRow(rows, actions))
    .child(body);

  const card = overlayCard('koja-ask-list')
    .h_full()
    .min_h(0)
    .gap(spacing.none)
    .on_mouse_down('left', stopPress)
    .child(column);

  return v_flex().id('koja-asks').size_full().justify_end().child(card);
};
