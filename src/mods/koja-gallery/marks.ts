import { h_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { FileStatus } from '../../kit/index.ts';
import {
  attentionBadge,
  fileStatusMark,
  indicator,
  spaceMark,
  spacing,
  statusMark,
} from '../../kit/index.ts';
import { sample } from './sample.ts';

const fileStatuses: FileStatus[] = ['A', 'M', 'D', 'U'];

const markWithLabel = (mark: Element, label: string): Element =>
  h_flex().gap(spacing.xsmall).items_center().child(mark).child(label);

export const marks = (): Element[] => [
  h_flex()
    .gap(spacing.large)
    .children([
      markWithLabel(statusMark('working'), 'working'),
      markWithLabel(statusMark('blocked'), 'blocked'),
      markWithLabel(statusMark('done'), 'done'),
      markWithLabel(statusMark('idle'), 'idle'),
      markWithLabel(spaceMark(null), 'no agent'),
      markWithLabel(statusMark(null), 'none'),
    ]),
  sample(
    'File status letters: added, modified, deleted, unmerged',
    h_flex()
      .gap(spacing.medium)
      .items_center()
      .children(fileStatuses.map((status) => fileStatusMark(status))),
  ),
  sample(
    'Indicators',
    h_flex()
      .gap(spacing.medium)
      .items_center()
      .child(indicator('ansi2'))
      .child(indicator('blocked'))
      .child(indicator('dim')),
  ),
  sample('Attention badge', attentionBadge('Needs you')),
];
