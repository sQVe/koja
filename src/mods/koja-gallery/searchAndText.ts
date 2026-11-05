import type { InputState } from 'gpui-base';
import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import {
  colors,
  detailText,
  emptyState,
  highlightedText,
  keyHint,
  searchField,
  separator,
  spacing,
} from '../../kit/index.ts';
import { matchOf } from './sample.ts';

export const searchAndText = (search: InputState): Element[] => [
  searchField(search, 'search'),
  separator(),
  emptyState('Nothing matches.'),
  h_flex()
    .gap(spacing.medium)
    .child(highlightedText('Go to space', matchOf('Go to space', 'Go'), true))
    .child(highlightedText('Go to space', matchOf('Go to space', 'sp'), false))
    .child(keyHint('ctrl-shift-p'))
    .child(detailText('#42', colors().ansi2)),
];
