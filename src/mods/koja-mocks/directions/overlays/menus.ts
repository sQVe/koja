import type { Element } from 'gpui-kit';

import { floating, withFloating } from '../floating.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { newAgents, newPlaces, newTerminal, paneMenu } from './content.ts';
import { agentItem, dividedRows, heading, keycapHints, menuItem, overlayTokens } from './parts.ts';

const menuWidth = 248;
// Where the user right-clicked in the focused pane's body.
const pointer = { x: 452, y: 168 };
const newMenuWidth = 256;
// Under the tab bar's `+`.
const newMenuRight = 112;
const newMenuTop = 34;

const contextMenu = (tokens: DirectionTokens): Element => {
  const rows = overlayTokens(tokens.rows.height, tokens);
  const hints = keycapHints(tokens);

  return floating(menuWidth, tokens)
    .left(pointer.x)
    .top(pointer.y)
    .children(dividedRows(paneMenu, (menu) => menuItem(menu, hints, rows), rows));
};

export const menuScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [contextMenu(tokens)], tokens);

const newMenu = (tokens: DirectionTokens): Element => {
  const rows = overlayTokens(tokens.rows.height, tokens);
  const hints = keycapHints(tokens);

  return floating(newMenuWidth, tokens)
    .right(newMenuRight)
    .top(newMenuTop)
    .child(menuItem(newTerminal, hints, rows))
    .child(heading('Start an agent', [], tokens))
    .children(newAgents.map((agent) => agentItem(agent, hints, rows)))
    .children(dividedRows(newPlaces, (place) => menuItem(place, hints, rows), rows));
};

export const newScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [newMenu(tokens)], tokens);
