import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import {
  colors,
  controlSize,
  footerLine,
  icon,
  iconButton,
  overlayCard,
  roleText,
  spacing,
  terminalFont,
  withTextRole,
} from '../../kit/index.ts';
import type { Ask } from './askFacts.ts';
import type { CardMore } from './card.ts';
import { moreText } from './card.ts';

export interface CardActions {
  goToAsk: () => void;
  dismiss: () => void;
}

const textInset = 18;

const bodyLineHeight = 18;

const terminalLineHeight = 17;

const detailLineHeight = 16;

const stopPress = (_event: unknown, cx: { stop_propagation: () => void }): void => {
  cx.stop_propagation();
};

const dismissButton = (actions: CardActions): Element =>
  iconButton({ name: 'x' })
    .id('koja-ask-dismiss')
    .accessibility_label('Dismiss the ask')
    .on_mouse_down('left', stopPress)
    .on_click((_event, cx) => {
      cx.stop_propagation();
      actions.dismiss();
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
    .child(dismissButton(actions));
};

const wrappedLine = (text: string, inset: boolean): Element => {
  const box = div()
    .w_full()
    .min_w(0)
    .flex_none()
    .whitespace_normal()
    .line_height(`${bodyLineHeight}px`)
    .when(inset, (element) => element.ml(textInset));

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

const moreLine = (more: CardMore): Element => {
  const box = div()
    .ml(textInset)
    .min_w(0)
    .line_height(`${detailLineHeight}px`)
    .overflow_hidden()
    .truncate();

  const text = withTextRole(box, 'detail', 'muted').child(moreText(more));
  const chevron = icon('chevron-right', 'small').text_color(colors().muted);

  return h_flex().gap(spacing.xxsmall).items_center().child(text).child(chevron);
};

const cardChildren = (
  ask: Ask,
  more: CardMore | null,
  normal: boolean,
  actions: CardActions,
): Element[] => {
  const title = titleRow(ask, actions);
  const question = wrappedLine(ask.question, true);
  const children = [title, question];

  if (ask.command !== null) {
    const command = commandLine(ask.command);

    children.push(command);
  }

  if (more !== null) {
    const moreRow = moreLine(more);

    children.push(moreRow);
  }

  if (normal) {
    const footer = footerLine([['g', 'n'], 'Go to this ask'])
      .px(0)
      .ml(textInset);

    children.push(footer);
  }

  return children;
};

export const cardElement = (
  ask: Ask,
  more: CardMore | null,
  normal: boolean,
  actions: CardActions,
): Element => {
  const card = overlayCard('koja-ask-card')
    .gap(spacing.small)
    .cursor_pointer()
    .on_mouse_down('left', stopPress)
    .on_click(() => {
      actions.goToAsk();
    })
    .children(cardChildren(ask, more, normal, actions));

  return v_flex().id('koja-asks').size_full().justify_end().child(card);
};
