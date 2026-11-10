import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { spacing } from '../../../../kit/size.ts';
import { changeListOf, diffCounts } from '../panels/changes.ts';
import { fixedLabel, label, row, statusMark } from '../parts.ts';
import { workNeedMark } from '../sidebars/facts.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { ContentItem } from './data.ts';
import { pullFiles, ticketSlices } from './data.ts';
import { contentSection, description, paragraph, readingInset } from './parts.ts';

const checkDetailInset = 34;
const threadGap = 12;
const pullAdded = pullFiles.reduce((sum, file) => sum + file.add, 0);
const pullDeleted = pullFiles.reduce((sum, file) => sum + file.del, 0);

const checks = [
  { name: 'typecheck', state: 'failing', detail: 'Type mismatch in rows.ts:48', status: 'blocked' },
  { name: 'tests', state: 'running', detail: 'Started 2m ago', status: 'working' },
  { name: 'style', state: 'running', detail: 'Started 1m ago', status: 'working' },
] as const;

const checksList = (stale: boolean, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .py(spacing.medium)
    .gap(spacing.medium)
    .children(
      checks.map((check) => {
        const status = stale ? 'idle' : check.status;
        const ink = stale ? tokens.ink.dim : tokens.marks[check.status];
        const detail = stale ? check.detail.replace(' ago', ' before last read') : check.detail;

        return v_flex()
          .flex_none()
          .min_w(0)
          .child(
            row(
              {
                selected: false,
                start: statusMark(status, tokens),
                label: label(check.name, tokens.text.body, tokens.ink.text),
                end: [fixedLabel(check.state, tokens.text.detail, ink)],
              },
              tokens,
            ),
          )
          .child(
            label(detail, tokens.text.detail, tokens.ink.dim)
              .ml(checkDetailInset)
              .mr(spacing.xlarge),
          );
      }),
    );

const checksSection = (stale: boolean, tokens: DirectionTokens): Element => {
  const parts: Element[] = [];

  if (stale) {
    parts.push(errorLine('Could not read checks · checks from 6m ago', tokens));
  }

  parts.push(checksList(stale, tokens));

  return contentSection('Checks 3', parts, tokens, 'failing');
};

const reviewThreads = (tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .px(readingInset)
    .py(spacing.medium)
    .gap(threadGap)
    .children(
      [
        { path: 'rows.ts · L48', text: 'Keep the selected row visible when the group folds.' },
        {
          path: 'repoLabel.ts · L27–31',
          text: 'Can the branch truncate before the repository name?',
        },
      ].map((thread) =>
        v_flex()
          .flex_none()
          .min_w(0)
          .gap(spacing.xsmall)
          .child(
            h_flex()
              .gap(spacing.small)
              .items_center()
              .child(workNeedMark('review', tokens))
              .child(fixedLabel(thread.path, tokens.text.detail, tokens.ink.dim))
              .child(fixedLabel('unresolved', tokens.text.detail, tokens.ink.dim)),
          )
          .child(paragraph(thread.text, tokens)),
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
  contentSection('Description', [description(item, tokens)], tokens),
  checksSection(staleChecks, tokens),
  contentSection('Threads 2', [reviewThreads(tokens)], tokens, 'review'),
  contentSection(
    'Files 9',
    [
      h_flex()
        .px(readingInset)
        .gap(spacing.small)
        .children(diffCounts(pullAdded, pullDeleted, tokens)),
      changeListOf(pullFiles, tokens),
    ],
    tokens,
  ),
];

export const ticketSections = (item: ContentItem, tokens: DirectionTokens): Element[] => [
  contentSection('Description', [description(item, tokens)], tokens),
  contentSection('Slices 3', [slicesList(tokens)], tokens),
];
