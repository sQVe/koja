import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { OverlayHint, SegmentedChipOptions } from '../../kit/index.ts';
import {
  footerLine,
  keycap,
  keycaps,
  overlayCard,
  overlayHints,
  pressedKeycap,
  roleText,
  rowHeight,
  searchLine,
  segmentedChip,
  spacing,
  statusMark,
} from '../../kit/index.ts';
import { sample, surfaceSample } from './sample.ts';

const label = (text: string): Element => roleText('body', text).flex_none();

const cardSample = (id: string, children: Element[]): Element => {
  const card = overlayCard(id);
  const shown = card.children(children);

  return surfaceSample('background', shown);
};

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

const card = (): Element =>
  cardSample('gallery-overlay-card', [
    label('Split right'),
    hintRow('Zoom', { normal: ['w', 'm'] }, true),
    hintRow('Close pane', { normal: ['w', 'q'] }, true),
  ]);

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
    .child(hintRow('Zoom with no insert binding', { normal: ['w', 'm'] }, false));

const search = (): Element => cardSample('gallery-overlay-search', [searchLine('Type a command')]);

const footer = (): Element =>
  cardSample('gallery-overlay-footer', [footerLine([['tab'], 'Next filter', ['↵'], 'Go to'])]);

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

  return cardSample('gallery-overlay-chips', [line]);
};

export const overlays = (): Element[] => [
  sample('Card', card()),
  sample('Keycaps: normal, a group, pressed', keycapsRow()),
  sample('Mode-aware hints', hintRows()),
  sample('Search line', search()),
  sample('Footer line', footer()),
  sample('Segmented chips', chips()),
];
