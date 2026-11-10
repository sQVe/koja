import { h_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';

import { keycaps, overlayBorder } from '../overlays/parts.ts';
import { fixedLabel } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DialogAsk } from './content.ts';
import { askContent } from './content.ts';

interface ButtonContent {
  label: string;
  key: string | null;
  fill: Color | null;
}

const buttonInk = '#eef0f6';
const buttonHeight = 24;
const buttonGap = 8;
const buttonPadding = 10;

const dialogButton = (content: ButtonContent, tokens: DirectionTokens): Element => {
  const color = content.fill === null ? tokens.ink.muted : buttonInk;

  const button = h_flex()
    .h(buttonHeight)
    .flex_none()
    .px(buttonPadding)
    .gap(buttonGap)
    .items_center()
    .rounded(tokens.pane.radius)
    .border(1)
    .border_color(content.fill ?? overlayBorder)
    .child(fixedLabel(content.label, tokens.text.body, color));

  if (content.fill !== null) {
    button.bg(content.fill);
  }

  if (content.key === null) {
    return button;
  }

  const caps = keycaps([content.key], tokens, {
    fill: null,
    outline: '#eef0f680',
    ink: buttonInk,
  });

  return button.child(caps);
};

export const dialogActions = (ask: DialogAsk, tokens: DirectionTokens): Element => {
  const content = askContent[ask];
  const fill = content.destructive ? tokens.marks.blocked : tokens.ink.text;

  return h_flex()
    .gap(buttonGap)
    .items_center()
    .justify_end()
    .child(dialogButton({ label: 'Cancel', key: null, fill: null }, tokens))
    .child(dialogButton({ label: content.action, key: '↵', fill }, tokens));
};
