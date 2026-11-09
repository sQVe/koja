import type { Element } from 'gpui-kit';

import { floating, withFloating } from '../floating.ts';
import { fixedLabel } from '../parts.ts';
import { divider } from '../sidebars/facts.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { CommandGroup } from './content.ts';
import { paletteGroups } from './content.ts';
import {
  centered,
  heading,
  iconMark,
  item,
  keycaps,
  overlayTokens,
  overlayTop,
  searchLine,
  searchRowHeight,
} from './parts.ts';

const paletteWidth = 560;

const paletteGroup = (group: CommandGroup, first: boolean, tokens: DirectionTokens): Element[] => {
  const rows = overlayTokens(searchRowHeight(tokens), tokens);
  const letter = fixedLabel(group.letter, tokens.text.detail, tokens.ink.dim);

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

const palette = (tokens: DirectionTokens): Element =>
  floating(paletteWidth, tokens)
    .left(centered(paletteWidth))
    .top(overlayTop)
    .child(searchLine('Type a command', tokens))
    .child(divider(overlayTokens(tokens.rows.height, tokens)))
    .children(paletteGroups.flatMap((group, index) => paletteGroup(group, index === 0, tokens)));

export const paletteScene = (tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [palette(tokens)], tokens);
