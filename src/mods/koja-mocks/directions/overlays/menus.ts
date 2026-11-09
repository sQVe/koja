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
  overlayTokens,
} from './parts.ts';

const menuWidth = 248;
// Where the user right-clicked in the focused pane's body.
const pointer = { x: 452, y: 168 };
const newMenuWidth = 256;
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
    .child(heading('Space', [], tokens))
    .children(newPlaces.map((place) => menuItem(place, false, hints, rows)))
    .children(modeFooter(rows));
};

// The `+` drawn pressed, with the toggle fill, over the tab bar's own button while the menu is open.
const pressedPlus = (tokens: DirectionTokens): Element =>
  h_flex()
    .absolute()
    .right(plusButtonRight)
    .top(plusButtonTop)
    .size(tokens.controls.size)
    .items_center()
    .justify_center()
    .rounded(tokens.controls.radius)
    .bg(tokens.controls.toggleFill)
    .text_color(tokens.controls.primary)
    .child(icon('plus', 'small'));

export const newScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [pressedPlus(tokens), newMenu(tokens)], tokens);
