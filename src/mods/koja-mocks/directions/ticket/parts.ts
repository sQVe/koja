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
import type { AgentTicket, Criterion, Readiness, Slice, TicketView } from './data.ts';

interface SectionHeading {
  name: string;
  count: string | null;
}

export interface IdentifierLook {
  width: number;
  source: SourceTarget;
  kind: 'linked' | 'current' | 'summary';
}

export const readinessStatus: Record<Readiness, Status> = {
  merged: 'done',
  'PR open': 'working',
  'PR draft': 'working',
  ready: 'idle',
  blocked: 'blocked',
};

const workStatuses: Record<Criterion['state'], Status> = {
  done: 'done',
  'in progress': 'working',
  todo: 'idle',
};

export const planChevronWidth = 12;
export const agentIndent = 16;
const identifierUnit = 6;
const identifierPadding = 10;
const statusWidth = 56;
const detailHeight = 16;

export const identifierWidths = (view: TicketView): { slice: number; agent: number } => {
  const sliceWidths = view.slices.map(
    (slice) => slice.identifier.length * identifierUnit + identifierPadding,
  );

  const agentWidths = Object.values(view.agents)
    .flat()
    .map((agent) => agent.identifier.length * identifierUnit + agentIndent);

  const width = Math.max(0, ...sliceWidths, ...agentWidths);

  return { slice: width, agent: width - agentIndent };
};

export const statusWord = (word: string, tokens: DirectionTokens): Element =>
  fixedLabel(word, tokens.text.detail, tokens.ink.dim).w(statusWidth).text_right();

export const nextReason = (slice: Extract<Slice, { readiness: 'ready' }>): string =>
  `can start · stacks on open koja ${slice.stack.pull} (${slice.stack.identifier})`;

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

  return sectionHeaderOf(title, { open, detail: [], end: [] }, tokens);
};

export const section = (name: string, parts: Element[], tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .child(sectionHeader({ name, count: null }, true, tokens))
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
    div()
      .min_w(0)
      .whitespace_normal()
      .line_height(`${tokens.rows.height}px`)
      .min_h(tokens.rows.height)
      .max_h(tokens.rows.height * 2)
      .overflow_hidden(),
    tokens.text.body,
    tokens.ink.text,
  )
    .child(text)
    .tooltip(text);

export const foldedSection = (
  name: string,
  count: string | null,
  tokens: DirectionTokens,
): Element => sectionHeader({ name, count }, false, tokens);

const planLink = (identifier: string, source: SourceTarget, tokens: DirectionTokens): Element =>
  sourceLink(identifier, tokens).tooltip(`${identifier} · ${source}`);

export const identifierCell = (
  identifier: string,
  look: IdentifierLook,
  tokens: DirectionTokens,
): Element => {
  const ink = look.kind === 'summary' ? tokens.ink.dim : tokens.ink.text;

  const text =
    look.kind === 'linked'
      ? planLink(identifier, look.source, tokens)
      : fixedLabel(identifier, tokens.text.detail, ink);

  return h_flex().w(look.width).flex_none().child(text);
};

export const workRow = (
  item: AgentTicket,
  look: IdentifierLook,
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
        .child(identifierCell(item.identifier, look, tokens))
        .child(label(item.title, tokens.text.body, tokens.ink.text).flex_1().tooltip(item.title)),
      end: [statusWord(item.state, tokens)],
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
    .child(sectionHeader({ name: 'Acceptance', count }, true, tokens))
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
