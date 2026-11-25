import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { OverlayHint, SegmentedChipOptions } from '../../kit/index.ts';
import {
  colors,
  footerLine,
  keycap,
  keycaps,
  overlayCard,
  overlayHints,
  pressedKeycap,
  rowHeight,
  searchLine,
  segmentedChip,
  spacing,
  statusMark,
  withTextRole,
} from '../../kit/index.ts';
import { sample } from './sample.ts';

const label = (text: string): Element => {
  const box = div().flex_none();

  return withTextRole(box, 'body').child(text);
};

// The gallery paints `popover`, so a sample sits on the pane fill to show the card's lighter edge.
const onPane = (content: Element): Element =>
  div().p(spacing.medium).bg(colors().background).child(content);

const hintRow = (text: string, hint: OverlayHint, normalMode: boolean): Element => {
  const spacer = div().flex_1();

  return h_flex()
    .h(rowHeight.small)
    .flex_none()
    .gap(spacing.small)
    .items_center()
    .child(label(text))
    .child(spacer)
    .children(overlayHints(hint, normalMode));
};

const card = (): Element => {
  const shown = overlayCard('gallery-overlay-card')
    .w_full()
    .child(label('Split right'))
    .child(hintRow('Zoom', { normal: ['w', 'm'] }, true))
    .child(hintRow('Close pane', { normal: ['w', 'q'] }, true));

  return onPane(shown);
};

const keycapsRow = (): Element =>
  h_flex()
    .gap(spacing.small)
    .items_center()
    .child(keycap('w'))
    .child(keycaps(['H', 'g', 'b', 'j', '1', 'tab', '↵']))
    .child(pressedKeycap('w'));

const hintRows = (): Element =>
  v_flex()
    .gap(spacing.xxsmall)
    .child(hintRow('Split right in normal mode', { normal: ['w', 'v'], insert: ['tab'] }, true))
    .child(hintRow('Split right in insert mode', { normal: ['w', 'v'], insert: ['tab'] }, false))
    .child(hintRow('Zoom in insert mode', { normal: ['w', 'm'] }, false));

const search = (): Element => {
  const frame = overlayCard('gallery-overlay-search').w_full();
  const shown = frame.child(searchLine('Type a command'));

  return onPane(shown);
};

const footer = (): Element => {
  const frame = overlayCard('gallery-overlay-footer').w_full();
  const shown = frame.child(footerLine([['tab'], 'Next filter', ['↵'], 'Go to']));

  return onPane(shown);
};

const chips = (): Element => {
  const shownChips: SegmentedChipOptions[] = [
    { label: 'All', count: 8, active: true },
    { label: 'Waiting', count: 2, active: false, start: statusMark('blocked') },
    { label: 'Done', count: 1, active: false, start: statusMark('done') },
  ];

  const line = h_flex()
    .gap(spacing.xsmall)
    .items_center()
    .children(shownChips.map((chip) => segmentedChip(chip)));

  const frame = overlayCard('gallery-overlay-chips').w_full();
  const shown = frame.child(line);

  return onPane(shown);
};

export const overlays = (): Element[] => [
  sample('Card', card()),
  sample('Keycaps', keycapsRow()),
  sample('Mode-aware hints', hintRows()),
  sample('Search line', search()),
  sample('Footer line', footer()),
  sample('Segmented chips', chips()),
];
