import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { floating, withFloating } from '../floating.ts';
import { fixedLabel } from '../parts.ts';
import { divider } from '../sidebars/facts.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { KeyGroup } from './content.ts';
import { paneKeys } from './content.ts';
import { centered, heading, keycaps, line, mainWidth, overlayTokens } from './parts.ts';

const widthShare = 0.8;
const cardWidth = Math.round(mainWidth * widthShare);
const cardInset = 16;
const columnGap = 16;
const keySlotWidth = 22;
// The card lists every pane key, so its rows are shorter than panel rows.
const keyRowCut = 4;

const keySlot = (key: string, tokens: DirectionTokens): Element =>
  h_flex()
    .w(keySlotWidth)
    .flex_none()
    .child(keycaps([key], tokens));

const keyColumn = (group: KeyGroup, tokens: DirectionTokens): Element => {
  const rows = overlayTokens(tokens.rows.height - keyRowCut, tokens);

  return v_flex()
    .flex_1()
    .min_w(0)
    .child(heading(group.name, [], rows))
    .children(
      group.keys.map((shown) =>
        line(
          [keySlot(shown.key, rows), fixedLabel(shown.action, rows.text.body, rows.ink.text)],
          [],
          rows,
        ),
      ),
    );
};

const keysCard = (tokens: DirectionTokens): Element =>
  floating(cardWidth, tokens)
    .left(centered(cardWidth))
    .bottom(cardInset)
    .child(
      line(
        [keySlot('w', tokens), fixedLabel('Panes', tokens.text.title, tokens.ink.text)],
        [],
        tokens,
      ),
    )
    .child(divider(overlayTokens(tokens.rows.height, tokens)))
    .child(
      h_flex()
        .flex_none()
        .gap(columnGap)
        .items_start()
        .children(paneKeys.map((group) => keyColumn(group, tokens))),
    );

export const keysScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [keysCard(tokens)], tokens);
