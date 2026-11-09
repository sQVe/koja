import { v_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { withFloating } from '../floating.ts';
import { fixedLabel } from '../parts.ts';
import { dimFact, divider } from '../sidebars/facts.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { CommandGroup } from './content.ts';
import { paletteGroups } from './content.ts';
import {
  centered,
  floatingOverlay,
  iconMark,
  item,
  keycaps,
  line,
  overlayTokens,
  overlayTop,
  searchLine,
} from './parts.ts';

const paletteWidth = 560;
// An empty query lists every command; the box shows the first of them.
const allCommands = 48;
const commandRowHeight = 26;
const scrollThumbWidth = 2;
// The thumb sits in the card's padding, right of the row pills, 2 px clear of the outline.
const scrollThumbOffset = 2;
const groupSpace = 6;
// The direction has no faint ink or scrollbar token, so the thumb is the dim ink, mostly clear.
const scrollThumbAlpha = '59';

const paletteGroup = (group: CommandGroup, first: boolean, tokens: DirectionTokens): Element[] => {
  const rows = overlayTokens(commandRowHeight, tokens);

  // The part letter follows the heading text, out of the key column, so it cannot read as a chord
  // with the row keys below.
  const groupHeading = line(
    [
      fixedLabel(group.name, tokens.text.heading, tokens.ink.muted),
      keycaps([group.letter], tokens),
    ],
    [],
    tokens,
  );

  if (!first) {
    groupHeading.mt(groupSpace);
  }

  return [
    groupHeading,
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
  const headings = paletteGroups.length * tokens.rows.height;
  const rows = shownCommands * commandRowHeight;
  const groupSpaces = (paletteGroups.length - 1) * groupSpace;

  return headings + rows + groupSpaces;
};

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
    .children(paletteGroups.flatMap((group, index) => paletteGroup(group, index === 0, tokens)))
    .child(thumb(tokens));

const countFooter = (tokens: DirectionTokens): Element =>
  line([], [dimFact(`${allCommands} commands`, tokens)], tokens);

export const commandPalette = (tokens: DirectionTokens): Element =>
  floatingOverlay(paletteWidth, tokens)
    .left(centered(paletteWidth))
    .top(overlayTop)
    .child(searchLine('Type a command', tokens))
    .child(divider(overlayTokens(tokens.rows.height, tokens)))
    .child(commandList(tokens))
    .child(divider(overlayTokens(tokens.rows.height, tokens)))
    .child(countFooter(tokens));

export const paletteScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [commandPalette(tokens)], tokens);
