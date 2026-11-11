import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Status } from 'herdr';

import { spacing } from '../../../../kit/size.ts';
import type { SourceTarget } from '../content/data.ts';
import { externalLink } from '../content/links.ts';
import {
  contentSection,
  contentSectionHeader,
  readingInset,
  sectionBodyInset,
} from '../content/parts.ts';
import { fixedLabel, label, row, statusMark } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { Readiness, WorkItem } from './data.ts';

export const readinessStatus: Record<Readiness, Status> = {
  merged: 'done',
  'in review': 'working',
  'in progress': 'working',
  ready: 'idle',
  blocked: 'blocked',
};

const detailHeight = 16;

export const detailLine = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .min_w(0)
    .min_h(detailHeight)
    .ml(sectionBodyInset(tokens))
    .mr(readingInset)
    .gap(spacing.small)
    .items_center();

export const note = (text: string, tokens: DirectionTokens): Element =>
  detailLine(tokens).child(label(text, tokens.text.detail, tokens.ink.dim).tooltip(text));

export const foldedSection = (
  name: string,
  count: number | undefined,
  tokens: DirectionTokens,
): Element => {
  const look = count === undefined ? { name } : { name, count };

  return contentSectionHeader(look, false, [], tokens);
};

export const workRow = (item: WorkItem, source: SourceTarget, tokens: DirectionTokens): Element => {
  const status = item.state === 'in progress' ? 'working' : 'idle';
  const mark = item.state === 'done' ? 'done' : status;
  const name = h_flex().flex_1().min_w(0).gap(spacing.small).items_center();

  if (item.identifier !== undefined) {
    name.child(externalLink(item.identifier, source, tokens).flex_none());
  }

  name.child(label(item.title, tokens.text.body, tokens.ink.text).flex_1().tooltip(item.title));

  const work = row(
    {
      selected: false,
      start: statusMark(mark, tokens),
      label: name,
      end: [fixedLabel(item.state, tokens.text.detail, tokens.ink.dim)],
    },
    tokens,
  );

  if (item.tracker === undefined) {
    return work;
  }

  return v_flex().flex_none().min_w(0).child(work).child(note(item.tracker, tokens));
};

export const acceptanceSection = (
  items: WorkItem[],
  source: SourceTarget,
  tokens: DirectionTokens,
): Element => {
  const done = items.filter((item) => item.state === 'done').length;
  const count = `${done} of ${items.length}`;

  return v_flex()
    .flex_none()
    .min_w(0)
    .child(
      contentSectionHeader(
        { name: 'Acceptance' },
        true,
        [fixedLabel(count, tokens.text.detail, tokens.ink.dim)],
        tokens,
      ),
    )
    .children(items.map((item) => workRow(item, source, tokens)));
};

export const pullRow = (
  pull: string,
  state: string,
  tracker: string,
  tokens: DirectionTokens,
): Element =>
  row(
    {
      selected: false,
      start: statusMark(state === 'merged' ? 'done' : 'working', tokens),
      label: h_flex()
        .min_w(0)
        .gap(spacing.small)
        .items_center()
        .child(fixedLabel(tracker, tokens.text.detail, tokens.ink.dim))
        .child(externalLink(pull, 'GitHub', tokens)),
      end: [fixedLabel(state, tokens.text.detail, tokens.ink.dim)],
    },
    tokens,
  );

export const relationSection = (tokens: DirectionTokens): Element =>
  contentSection(
    { name: 'Relations' },
    [note('Blocked by ME-1282 · merged · cleared', tokens), note('Blocks ME-1285', tokens)],
    tokens,
  );

export const activitySection = (tokens: DirectionTokens): Element =>
  foldedSection('Activity', 2, tokens).tooltip(
    'Code review · 2 findings fixed · 2h ago\nSlice audit · 3 met · 2 not run · 1h ago',
  );
