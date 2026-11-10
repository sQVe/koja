import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { spacing } from '../../../../kit/size.ts';
import { diffCounts } from '../panels/changes.ts';
import { fixedLabel, label, row, statusMark } from '../parts.ts';
import { workNeedMark } from '../sidebars/facts.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { ContentItem } from './data.ts';
import { pullFiles, ticketSlices } from './data.ts';
import {
  checkMark,
  contentSection,
  contentSectionHeader,
  description,
  paragraph,
} from './parts.ts';

const statusSlotWidth = 14;
const rowGap = 6;

const statusSlot = (mark: Element): Element =>
  h_flex().w(statusSlotWidth).flex_none().items_center().justify_center().child(mark);

const detailInset = (tokens: DirectionTokens): number =>
  tokens.rows.inset + tokens.rows.paddingX + statusSlotWidth + rowGap;

const threadGap = spacing.xsmall;
const pullAdded = pullFiles.reduce((sum, file) => sum + file.add, 0);
const pullDeleted = pullFiles.reduce((sum, file) => sum + file.del, 0);

const checks = [
  { name: 'typecheck', state: 'failing', detail: 'Type mismatch in rows.ts:48', status: 'blocked' },
  {
    name: 'tests',
    state: 'running',
    detail: 'started 2m ago',
    staleDetail: 'started 8m ago',
    status: 'working',
  },
  {
    name: 'style',
    state: 'running',
    detail: 'started 1m ago',
    staleDetail: 'started 7m ago',
    status: 'working',
  },
] as const;

const checksList = (stale: boolean, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .py(spacing.xxsmall)
    .gap(spacing.xxsmall)
    .children(
      checks.map((check) => {
        const ink = stale ? tokens.ink.dim : tokens.marks[check.status];
        const hasStaleAge = stale && 'staleDetail' in check;
        const detail = hasStaleAge ? check.staleDetail : check.detail;

        return v_flex()
          .flex_none()
          .min_w(0)
          .child(
            row(
              {
                selected: false,
                start: statusSlot(checkMark(check.state, tokens)),
                label: label(check.name, tokens.text.body, tokens.ink.text),
                end: [fixedLabel(check.state, tokens.text.detail, ink)],
              },
              tokens,
            ),
          )
          .child(
            label(detail, tokens.text.detail, tokens.ink.dim)
              .ml(detailInset(tokens))
              .mr(spacing.xlarge),
          );
      }),
    );

const checksSection = (stale: boolean, tokens: DirectionTokens): Element => {
  const parts: Element[] = [];

  if (stale) {
    parts.push(errorLine('Could not refresh checks · showing checks from 6m ago', tokens));
  }

  parts.push(checksList(stale, tokens));

  return contentSection({ name: 'Checks', count: 3, need: 'failing' }, parts, tokens);
};

const reviewThreads = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .py(spacing.xsmall)
    .gap(threadGap)
    .children(
      [
        {
          reference: 'rows.ts:48',
          detail: 'sqve · 2h ago',
          text: 'Keep the selected row visible when the group folds.',
        },
        {
          reference: 'repoLabel.ts:27–31',
          detail: 'sqve · 1h ago',
          text: 'Can the branch truncate before the repository name?',
        },
      ].map((thread) =>
        v_flex()
          .flex_none()
          .min_w(0)
          .gap(spacing.xxsmall)
          .child(
            row(
              {
                selected: false,
                start: statusSlot(workNeedMark('review', tokens)),
                label: label(thread.reference, tokens.text.body, tokens.ink.text),
                end: [fixedLabel('unresolved', tokens.text.detail, tokens.marks.modified)],
              },
              tokens,
            ),
          )
          .child(paragraph(thread.text, tokens).ml(detailInset(tokens)).mr(spacing.xlarge))
          .child(
            label(thread.detail, tokens.text.detail, tokens.ink.dim)
              .ml(detailInset(tokens))
              .mr(spacing.xlarge),
          ),
      ),
    );

const slicesList = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .py(spacing.medium)
    .gap(spacing.xsmall)
    .children(
      ticketSlices.map((slice) =>
        row(
          {
            selected: false,
            start: statusMark(slice.status, tokens),
            label: label(slice.title, tokens.text.body, tokens.ink.text),
            end: [fixedLabel(slice.state, tokens.text.detail, tokens.ink.dim)],
          },
          tokens,
        ),
      ),
    );

export const pullSections = (
  item: ContentItem,
  staleChecks: boolean,
  tokens: DirectionTokens,
): Element[] => [
  checksSection(staleChecks, tokens),
  contentSection({ name: 'Threads', count: 2, need: 'review' }, [reviewThreads(tokens)], tokens),
  contentSection({ name: 'Description' }, [description(item, tokens)], tokens),
  contentSectionHeader(
    { name: 'Files', count: 9 },
    false,
    diffCounts(pullAdded, pullDeleted, tokens),
    tokens,
  ),
];

export const ticketSections = (item: ContentItem, tokens: DirectionTokens): Element[] => [
  contentSection({ name: 'Description' }, [description(item, tokens)], tokens),
  contentSection({ name: 'Slices', count: 3 }, [slicesList(tokens)], tokens),
];
