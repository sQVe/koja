import { v_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { withFloating } from '../floating.ts';
import { dimFact, divider } from '../sidebars/facts.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { CommandGroup } from './content.ts';
import { paletteGroups } from './content.ts';
import {
  centered,
  floatingOverlay,
  heading,
  iconMark,
  item,
  keycaps,
  leadKeycap,
  line,
  overlayTokens,
  overlayTop,
  searchLine,
  searchRowHeight,
} from './parts.ts';

const paletteWidth = 560;
// The full command list is longer than the box shows.
const allCommands = 48;
const listGap = 2;
const scrollThumbWidth = 3;
// The thumb sits in the card's padding, right of the row pills.
const scrollThumbOffset = 4;
// The direction has no faint ink or scrollbar token, so the thumb is the dim ink, mostly clear.
const scrollThumbAlpha = '59';

const paletteGroup = (group: CommandGroup, first: boolean, tokens: DirectionTokens): Element[] => {
  const rows = overlayTokens(searchRowHeight(tokens), tokens);
  const letter = leadKeycap(group.letter, tokens);

  return [
    heading(group.name, [letter], tokens),
    ...group.commands.map((command, index) =>
      item(
        {
          start: iconMark(command.icon, tokens.ink.muted),
          text: command.title,
          end: [keycaps(command.keys, tokens)],
          selected: first && index === 0,
        },
        rows,
      ),
    ),
  ];
};

const shownCommands = paletteGroups.reduce((sum, group) => sum + group.commands.length, 0);

const scrollThumb = (tokens: DirectionTokens): Color => `${tokens.ink.dim}${scrollThumbAlpha}`;

const listHeight = (tokens: DirectionTokens): number => {
  const lines = paletteGroups.length + shownCommands;
  const headings = paletteGroups.length * tokens.rows.height;
  const rows = shownCommands * searchRowHeight(tokens);

  return headings + rows + (lines - 1) * listGap;
};

// Sized for the shown rows out of all commands, at the top of the list.
const thumb = (tokens: DirectionTokens): Element =>
  div()
    .absolute()
    .top(0)
    .right(-scrollThumbOffset - scrollThumbWidth)
    .w(scrollThumbWidth)
    .h((listHeight(tokens) * shownCommands) / allCommands)
    .rounded(scrollThumbWidth / 2)
    .bg(scrollThumb(tokens));

const commandList = (tokens: DirectionTokens): Element =>
  v_flex()
    .relative()
    .flex_none()
    .gap(listGap)
    .children(paletteGroups.flatMap((group, index) => paletteGroup(group, index === 0, tokens)))
    .child(thumb(tokens));

const countFooter = (tokens: DirectionTokens): Element =>
  line([], [dimFact(`${shownCommands} of ${allCommands}`, tokens)], tokens);

const palette = (tokens: DirectionTokens): Element =>
  floatingOverlay(paletteWidth, tokens)
    .left(centered(paletteWidth))
    .top(overlayTop)
    .child(searchLine('Type a command', tokens))
    .child(divider(overlayTokens(tokens.rows.height, tokens)))
    .child(commandList(tokens))
    .child(divider(overlayTokens(tokens.rows.height, tokens)))
    .child(countFooter(tokens));

export const paletteScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [palette(tokens)], tokens);
