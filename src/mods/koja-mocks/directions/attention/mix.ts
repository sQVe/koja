import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { wrappedText } from '../dialogs/parts.ts';
import { footerLine, iconMark, mainLeft, overlayCard } from '../overlays/parts.ts';
import { fixedLabel, iconButton, label, terminalFont } from '../parts.ts';
import type { DirectionTokens, TextStyle } from '../tokens.ts';
import { attentionWindow, focusedPaneWidth, hiddenAsks } from './data.ts';

type HiddenAsk = (typeof hiddenAsks)[number];

export interface MixState {
  asks: readonly HiddenAsk[];
  listOpen: boolean;
  dismissed: boolean;
}

const maximumCardWidth = 420;
const paneClearance = 16;
const cardPadding = 10;
const lineGap = 6;
const rowPadding = 8;
const textInset = 20;
// The close icon sits centered in a wider button, so the title pads less to line the icon up with
// the project names below it.
const closeIconInset = 3;

export const createMixState = (asks: readonly HiddenAsk[] = hiddenAsks): MixState => ({
  asks,
  listOpen: false,
  dismissed: false,
});

const dismissControl = (state: MixState, tokens: DirectionTokens): Element =>
  iconButton('x', tokens, tokens.ink.dim)
    .id('attention-mix-dismiss')
    .accessibility_label('Dismiss attention')
    .cursor_pointer()
    .on_mouse_down('left', (_event, context) => {
      context.stop_propagation();
    })
    .on_click((_event, context) => {
      context.stop_propagation();
      state.dismissed = true;
      context.notify();
    });

const moreControl = (state: MixState, tokens: DirectionTokens): Element => {
  const next = state.asks[1];
  const others = state.asks.length - 1;

  const text =
    others === 1 && next !== undefined ? `1 more ask in ${next.space}` : `${others} more asks`;

  return h_flex()
    .id('attention-mix-more')
    .accessibility_label('Show all asks')
    .min_w(0)
    .gap(2)
    .ml(textInset)
    .items_center()
    .cursor_pointer()
    .child(label(text, tokens.text.detail, tokens.ink.muted))
    .child(iconMark('chevron-right', tokens.ink.muted))
    .on_mouse_down('left', (_event, context) => {
      context.stop_propagation();
    })
    .on_click((_event, context) => {
      context.stop_propagation();
      state.listOpen = true;
      context.notify();
    });
};

const commandLine = (ask: HiddenAsk, style: TextStyle, tokens: DirectionTokens): Element[] => {
  if (ask.command === null) {
    return [];
  }

  const command = wrappedText(ask.command, style, tokens.ink.text)
    .font_family(terminalFont)
    .ml(textInset);

  return [command];
};

const askTitle = (ask: HiddenAsk, state: MixState, tokens: DirectionTokens): Element =>
  h_flex()
    .h(tokens.controls.size)
    .gap(lineGap)
    .items_center()
    .child(iconMark('message-circle-question', tokens.marks.blocked))
    .child(fixedLabel(ask.space, tokens.text.title, tokens.ink.text))
    .child(label(ask.agent, tokens.text.detail, tokens.ink.dim).flex_1())
    .child(dismissControl(state, tokens));

const askLine = (ask: HiddenAsk, state: MixState, tokens: DirectionTokens): Element => {
  const line = v_flex()
    .child(askTitle(ask, state, tokens))
    .child(wrappedText(ask.question, tokens.text.body, tokens.ink.text).ml(textInset))
    .children(commandLine(ask, tokens.text.body, tokens));

  if (state.asks.length > 1) {
    line.child(moreControl(state, tokens).mt(lineGap));
  }

  return line;
};

const askRow = (ask: HiddenAsk, tokens: DirectionTokens): Element => {
  const title = h_flex()
    .gap(lineGap)
    .items_center()
    .child(iconMark('message-circle-question', tokens.marks.blocked))
    .child(fixedLabel(ask.space, tokens.text.title, tokens.ink.text))
    .child(h_flex().flex_1())
    .child(fixedLabel(ask.project, tokens.text.detail, tokens.ink.dim));

  const detail = `${ask.agent} · ${ask.question}`;

  return v_flex()
    .flex_none()
    .px(rowPadding)
    .py(lineGap)
    .gap(2)
    .rounded(tokens.rows.radius)
    .hover((element) => element.bg(tokens.rows.hoverFill))
    .child(title)
    .child(wrappedText(detail, tokens.text.body, tokens.ink.muted).ml(textInset))
    .children(commandLine(ask, tokens.text.body, tokens));
};

const askList = (state: MixState, tokens: DirectionTokens): Element => {
  const titleText = `${state.asks.length} asks in other spaces`;

  const title = h_flex()
    .h(tokens.rows.height)
    .pl(rowPadding)
    .pr(closeIconInset)
    .items_center()
    .child(fixedLabel(titleText, tokens.text.title, tokens.ink.text))
    .child(h_flex().flex_1())
    .child(dismissControl(state, tokens));

  return v_flex()
    .gap(2)
    .child(title)
    .children(state.asks.map((ask) => askRow(ask, tokens)));
};

const positionedCard = (tokens: DirectionTokens): Element => {
  const paneWidth = focusedPaneWidth(tokens);
  const width = Math.min(maximumCardWidth, paneWidth - 2 * paneClearance);
  const paneLeft = mainLeft + tokens.areas.contentPadding;
  const left = paneLeft + (paneWidth - width) / 2;
  const bottom = tokens.areas.contentPadding + paneClearance;

  return overlayCard(tokens)
    .absolute()
    .left(left)
    .bottom(bottom)
    .w(width)
    .p(cardPadding)
    .gap(lineGap);
};

export const mixScene = (
  open: boolean,
  tokens: DirectionTokens,
  state: MixState = createMixState(),
): Element => {
  const scene = v_flex()
    .relative()
    .flex_1()
    .min_h(0)
    .child(attentionWindow({ variant: 'mix' }, tokens));

  const ask = state.asks[0];

  if (state.dismissed || ask === undefined) {
    return scene;
  }

  const listOpen = open || state.listOpen;
  const content = listOpen ? askList(state, tokens) : askLine(ask, state, tokens);
  const card = positionedCard(tokens).child(content);

  if (tokens.normal) {
    card.child(
      footerLine([['g', 'n'], 'Go to this ask'], tokens)
        .px(0)
        .ml(textInset),
    );
  }

  return scene.child(card);
};
