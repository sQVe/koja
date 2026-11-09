import type { Element } from 'gpui-kit';

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

const countFooter = (tokens: DirectionTokens): Element =>
  line([], [dimFact(`${shownCommands} of ${allCommands}`, tokens)], tokens);

const palette = (tokens: DirectionTokens): Element =>
  floatingOverlay(paletteWidth, tokens)
    .left(centered(paletteWidth))
    .top(overlayTop)
    .child(searchLine('Type a command', tokens))
    .child(divider(overlayTokens(tokens.rows.height, tokens)))
    .children(paletteGroups.flatMap((group, index) => paletteGroup(group, index === 0, tokens)))
    .child(divider(overlayTokens(tokens.rows.height, tokens)))
    .child(countFooter(tokens));

export const paletteScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [palette(tokens)], tokens);
