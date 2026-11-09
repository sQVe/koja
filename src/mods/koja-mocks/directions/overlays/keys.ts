import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { withFloating } from '../floating.ts';
import { fixedLabel } from '../parts.ts';
import { divider } from '../sidebars/facts.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { KeyGroup } from './content.ts';
import { paneKeys } from './content.ts';
import {
  heading,
  keycaps,
  line,
  mainLeft,
  mainWidth,
  overlayCard,
  overlayTokens,
} from './parts.ts';

// From the bottom of the content area to the pane bottoms: the content padding.
const paneBottomOffset = 8;
// A clear gap above the pane bottoms, so the card edge never runs beside a pane edge.
const cardGapAbovePanes = 24;
// Columns take their content's width, with one even gap between them.
const columnGap = 32;
// The card lists every pane key, so its rows are shorter than panel rows.
const keyRowCut = 4;

const keyLine = (key: string, action: Element, tokens: DirectionTokens): Element =>
  line([keycaps([key], tokens), action], [], tokens);

const keyColumn = (group: KeyGroup, tokens: DirectionTokens): Element => {
  const rows = overlayTokens(tokens.rows.height - keyRowCut, tokens);

  return v_flex()
    .flex_none()
    .child(heading(group.name, [], rows))
    .children(
      group.keys.map((shown) =>
        keyLine(shown.key, fixedLabel(shown.action, rows.text.body, rows.ink.text), rows),
      ),
    );
};

const keysCard = (tokens: DirectionTokens): Element =>
  overlayCard(tokens)
    .flex_none()
    .child(keyLine('w', fixedLabel('Panes', tokens.text.title, tokens.ink.text), tokens))
    .child(divider(overlayTokens(tokens.rows.height, tokens)))
    .child(
      h_flex()
        .flex_none()
        .gap(columnGap)
        .items_start()
        .children(paneKeys.map((group) => keyColumn(group, tokens))),
    );

// A strip across the main column centers the card, which is only as wide as its columns.
const bottomCenter = (card: Element): Element =>
  h_flex()
    .absolute()
    .left(mainLeft)
    .w(mainWidth)
    .bottom(paneBottomOffset + cardGapAbovePanes)
    .justify_center()
    .child(card);

export const keysScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [bottomCenter(keysCard(tokens))], tokens);
