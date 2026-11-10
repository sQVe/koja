import { h_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { caret } from '../overlays/parts.ts';
import { fixedLabel, label, styled } from '../parts.ts';
import type { DirectionTokens, TextStyle } from '../tokens.ts';
import { spaceName } from './content.ts';

const fieldHeight = 28;

export const dialogBlockGap = 8;

export const fieldHintGap = 4;

export const wrappedText = (text: string, style: TextStyle, color: Color): Element =>
  styled(div().min_w(0).flex_none().whitespace_normal(), style, color).child(text);

export const quotedTitle = (title: string, name: string, tokens: DirectionTokens): Element =>
  h_flex()
    .min_w(0)
    .child(fixedLabel(`${title} “`, tokens.text.title, tokens.ink.text))
    .child(label(name, tokens.text.title, tokens.ink.text))
    .child(fixedLabel('”', tokens.text.title, tokens.ink.text));

const selectedName = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .items_center()
    .child(fixedLabel(spaceName, tokens.text.body, tokens.ink.text).bg(tokens.rows.selectedFill))
    .child(caret(tokens));

export const renameField = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(fieldHeight)
    .flex_none()
    .px(tokens.rows.paddingX)
    .items_center()
    .rounded(tokens.pane.radius)
    .bg(tokens.pane.fill)
    .border(1)
    .border_color(tokens.ink.text)
    .child(selectedName(tokens));
