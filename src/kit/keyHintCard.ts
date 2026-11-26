import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { keycaps, pressedKeycap } from './keycap.ts';
import type { KeyHintGroup, KeyHintRow, PartKeyHints } from './keyHints.ts';
import { overlayCard } from './overlay/card.ts';
import { rowHeight, spacing } from './size.ts';
import { separator } from './text.ts';
import { roleText } from './textRole.ts';

// The card's rows are 4 px shorter than panel rows, so the four pane groups stay narrow.
const rowCut = spacing.xsmall;
const columnGap = 32;
// The card pads itself, so a line's own inset puts the text at the card's text edge.
const textInset = spacing.medium;
const lineGap = spacing.small;

const cardLine = (height: number, children: Element[]): Element =>
  h_flex().h(height).flex_none().px(textInset).gap(lineGap).items_center().children(children);

const titleLine = (hints: PartKeyHints): Element =>
  cardLine(rowHeight.small, [pressedKeycap(hints.letter), roleText('title', hints.title)]);

const rule = (): Element => separator().my(spacing.none).mx(textInset);

const hintRow = (row: KeyHintRow, height: number): Element =>
  cardLine(height, [keycaps(row.keys), roleText('body', row.label)]);

const hintColumn = (group: KeyHintGroup, height: number): Element =>
  v_flex()
    .flex_none()
    .child(cardLine(height, [roleText('sectionHeading', group.title)]))
    .children(group.rows.map((row) => hintRow(row, height)));

export const keyHintCard = (hints: PartKeyHints): Element => {
  const height = rowHeight.small - rowCut;

  const columns = h_flex()
    .flex_none()
    .gap(columnGap)
    .items_start()
    .children(hints.groups.map((group) => hintColumn(group, height)));

  return overlayCard('key-hint-card')
    .w_auto()
    .flex_none()
    .child(titleLine(hints))
    .child(rule())
    .child(columns);
};
