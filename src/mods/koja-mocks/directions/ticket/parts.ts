import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';
import type { Status } from 'herdr';

import { spacing } from '../../../../kit/size.ts';
import type { SourceTarget } from '../content/data.ts';
import { readingInset, sectionBodyInset } from '../content/parts.ts';
import { sectionHeaderOf } from '../panels/frame.ts';
import { fixedLabel, label, row, statusMark, styled } from '../parts.ts';
import { sourceLink } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { AgentTicket, Criterion, Readiness } from './data.ts';

interface SectionHeading {
  name: string;
  count: string | null;
  source: SourceTarget | null;
}

export const readinessStatus: Record<Readiness, Status> = {
  merged: 'done',
  'PR open': 'working',
  'PR draft': 'working',
  'in progress': 'working',
  ready: 'idle',
  blocked: 'blocked',
};

const workStatuses: Record<Criterion['state'], Status> = {
  done: 'done',
  'in progress': 'working',
  todo: 'idle',
};

export const planChevronWidth = 12;
const identifierWidth = 72;
const detailHeight = 16;
const wrappedHeight = detailHeight * 2;

export const sectionHeader = (
  heading: SectionHeading,
  open: boolean,
  tokens: DirectionTokens,
): Element => {
  const title = h_flex()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(fixedLabel(heading.name, tokens.text.heading, tokens.ink.text));

  if (heading.count !== null) {
    title.child(fixedLabel(heading.count, tokens.text.detail, tokens.ink.dim));
  }

  if (heading.source !== null) {
    title.child(fixedLabel(`· ${heading.source}`, tokens.text.detail, tokens.ink.dim));
  }

  return sectionHeaderOf(title, { open, detail: [], end: [] }, tokens);
};

export const section = (name: string, parts: Element[], tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .child(sectionHeader({ name, count: null, source: null }, true, tokens))
    .children(parts);

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

export const wrappedText = (text: string, tokens: DirectionTokens): Element =>
  styled(
    div().min_w(0).whitespace_normal().line_height('16px').max_h(wrappedHeight).overflow_hidden(),
    tokens.text.body,
    tokens.ink.text,
  )
    .child(text)
    .tooltip(text);

export const foldedSection = (
  name: string,
  count: string | null,
  tokens: DirectionTokens,
): Element => sectionHeader({ name, count, source: null }, false, tokens);

export const planLink = (
  identifier: string,
  source: SourceTarget,
  tokens: DirectionTokens,
): Element => sourceLink(identifier, tokens).tooltip(`${identifier} · ${source}`);

export const identifierCell = (
  identifier: string,
  source: SourceTarget,
  linked: boolean,
  tokens: DirectionTokens,
): Element => {
  const text = linked
    ? planLink(identifier, source, tokens)
    : fixedLabel(identifier, tokens.text.detail, tokens.ink.muted);

  return h_flex().w(identifierWidth).flex_none().child(text);
};

export const workRow = (
  item: AgentTicket,
  source: SourceTarget,
  tokens: DirectionTokens,
): Element =>
  row(
    {
      selected: false,
      start: statusMark(workStatuses[item.state], tokens),
      label: h_flex()
        .flex_1()
        .min_w(0)
        .gap(spacing.small)
        .items_center()
        .pl(planChevronWidth + spacing.xsmall)
        .child(identifierCell(item.identifier, source, true, tokens))
        .child(label(item.title, tokens.text.body, tokens.ink.text).flex_1().tooltip(item.title)),
      end: [fixedLabel(item.state, tokens.text.detail, tokens.ink.dim)],
    },
    tokens,
  );

const criterionRow = (item: Criterion, tokens: DirectionTokens): Element =>
  row(
    {
      selected: false,
      start: statusMark(workStatuses[item.state], tokens),
      label: label(item.title, tokens.text.body, tokens.ink.text).tooltip(item.title),
      end: [fixedLabel(item.state, tokens.text.detail, tokens.ink.dim)],
    },
    tokens,
  );

export const acceptanceSection = (items: Criterion[], tokens: DirectionTokens): Element => {
  const done = items.filter((item) => item.state === 'done').length;
  const count = `${done} of ${items.length}`;

  return v_flex()
    .flex_none()
    .min_w(0)
    .child(sectionHeader({ name: 'Acceptance', count, source: null }, true, tokens))
    .children(items.map((item) => criterionRow(item, tokens)));
};

export const relationSection = (tokens: DirectionTokens): Element =>
  section(
    'Relations',
    [note('Blocked by ME-1282 · merged · cleared', tokens), note('Blocks ME-1285', tokens)],
    tokens,
  );

export const activitySection = (tokens: DirectionTokens): Element =>
  foldedSection('Activity', '2', tokens).tooltip(
    'Code review · 2 findings fixed · 2h ago\nSlice audit · 3 met · 2 not run · 1h ago',
  );
