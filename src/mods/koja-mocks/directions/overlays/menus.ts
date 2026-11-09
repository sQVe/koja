import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { withFloating } from '../floating.ts';
import { divider } from '../sidebars/facts.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { newAgents, newPlaces, newTerminal, paneMenu } from './content.ts';
import {
  agentItem,
  dividedRows,
  floatingOverlay,
  heading,
  keycapHints,
  menuItem,
  modeFooter,
  newMenuFooter,
  overlayTokens,
} from './parts.ts';

// Wide enough for the footer that names normal mode.
const menuWidth = 296;
// The focused pane's right border, measured from the insert-mode window.
const focusedPaneRight = 703;
// A clear gap from that border, so the menu edge never runs beside it.
const menuGapFromPane = 16;
// The menu's top left: near the right-click in the focused pane's body, kept clear of its border.
const pointer = { x: focusedPaneRight - menuGapFromPane - menuWidth, y: 168 };
const newMenuWidth = 296;
// Under the tab bar's `+`.
const newMenuRight = 112;
const newMenuTop = 34;
// The tab bar's `+` button, measured from the insert-mode window: 24 px, centered in the bar.
const plusButtonRight = 111;
const plusButtonTop = 6;

const contextMenu = (tokens: DirectionTokens): Element => {
  const rows = overlayTokens(tokens.rows.height, tokens);
  const hints = keycapHints(tokens);

  return floatingOverlay(menuWidth, tokens)
    .left(pointer.x)
    .top(pointer.y)
    .children(
      dividedRows(paneMenu, (menu, index) => menuItem(menu, index === 0, hints, rows), rows),
    )
    .children(modeFooter(rows));
};

export const menuScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [contextMenu(tokens)], tokens);

const newMenu = (tokens: DirectionTokens): Element => {
  const rows = overlayTokens(tokens.rows.height, tokens);
  const hints = keycapHints(tokens);

  return floatingOverlay(newMenuWidth, tokens)
    .right(newMenuRight)
    .top(newMenuTop)
    .child(heading('New tab', [], tokens))
    .child(menuItem(newTerminal, true, hints, rows))
    .children(newAgents.map((agent) => agentItem(agent, hints, rows)))
    .child(divider(rows))
    .child(heading('New space', [], tokens))
    .children(newPlaces.map((place) => menuItem(place, false, hints, rows)))
    .children(newMenuFooter(rows));
};

// The `+` drawn pressed over the tab bar's own button while the menu is open. It takes the row pill
// fill, not the toggle's look, so it does not read as the Changes toggle that is on.
const pressedPlus = (tokens: DirectionTokens): Element =>
  h_flex()
    .absolute()
    .right(plusButtonRight)
    .top(plusButtonTop)
    .size(tokens.controls.size)
    .items_center()
    .justify_center()
    .rounded(tokens.controls.radius)
    .bg(tokens.rows.selectedFill)
    .text_color(tokens.controls.primary)
    .child(icon('plus', 'small'));

export const newScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [pressedPlus(tokens), newMenu(tokens)], tokens);
