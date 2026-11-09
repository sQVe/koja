import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { agentPane } from '../../scenes/shellContent.ts';
import { withFloating } from '../floating.ts';
import { fixedLabel } from '../parts.ts';
import { divider } from '../sidebars/facts.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { newPi, newPlaces, newTerminal, paneMenu } from './content.ts';
import {
  dividedRows,
  floatingOverlay,
  heading,
  iconMark,
  line,
  menuItem,
  overlayTokens,
} from './parts.ts';

const menuWidth = 248;
// The focused pane's right border, measured from the insert-mode window.
const focusedPaneRight = 703;
// A clear gap from that border, so the menu edge never runs beside it.
const menuGapFromPane = 16;
// The menu's top left: near the right-click in the focused pane's body, kept clear of its border.
const pointer = { x: focusedPaneRight - menuGapFromPane - menuWidth, y: 168 };
// Wide enough for the worktree rows.
const newMenuWidth = 296;
// Under the tab bar's `+`.
const newMenuRight = 112;
const newMenuTop = 34;
// The tab bar's `+` button, measured from the insert-mode window: 24 px, centered in the bar.
const plusButtonRight = 111;
const plusButtonTop = 6;
// The `Normal` pill is wider than `Insert`, so in normal mode the `+` sits this much further left.
// Measured from the two windows.
const normalPillWiden = 6;

const modeShift = (tokens: DirectionTokens): number => (tokens.normal ? normalPillWiden : 0);

// Names the pane the menu acts on, in the heading style, above the first action.
const targetHeading = (tokens: DirectionTokens): Element =>
  line(
    [
      iconMark('terminal', tokens.ink.muted),
      fixedLabel(agentPane.name, tokens.text.heading, tokens.ink.muted),
    ],
    [],
    tokens,
  );

const contextMenu = (tokens: DirectionTokens): Element => {
  const rows = overlayTokens(tokens.rows.height, tokens);

  return floatingOverlay(menuWidth, tokens)
    .left(pointer.x)
    .top(pointer.y)
    .child(targetHeading(rows))
    .children(dividedRows(paneMenu, (menu, index) => menuItem(menu, index === 0, rows), rows));
};

export const menuScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [contextMenu(tokens)], tokens);

const newMenu = (tokens: DirectionTokens): Element => {
  const rows = overlayTokens(tokens.rows.height, tokens);

  return floatingOverlay(newMenuWidth, tokens)
    .right(newMenuRight + modeShift(tokens))
    .top(newMenuTop)
    .child(heading('New tab', [], tokens))
    .child(menuItem(newTerminal, true, rows))
    .child(menuItem(newPi, false, rows))
    .child(divider(rows))
    .child(heading('New space', [], tokens))
    .children(newPlaces.map((place) => menuItem(place, false, rows)));
};

// The `+` drawn pressed over the tab bar's own button while the menu is open. It takes the row pill
// fill, not the toggle's look, so it does not read as the Changes toggle that is on.
const pressedPlus = (tokens: DirectionTokens): Element =>
  h_flex()
    .absolute()
    .right(plusButtonRight + modeShift(tokens))
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
