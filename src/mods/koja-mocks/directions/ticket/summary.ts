import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { spacing } from '../../../../kit/size.ts';
import { agentLink, externalLink } from '../content/links.ts';
import { readingInset, sectionBodyInset } from '../content/parts.ts';
import { fixedLabel, label, row } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { ActiveSlice, Slice, TicketView } from './data.ts';
import { isActiveSlice } from './data.ts';
import {
  detailLine,
  identifierCell,
  identifierWidths,
  nextReason,
  note,
  planChevronWidth,
  section,
  statusWord,
  workRow,
  wrappedText,
} from './parts.ts';
import { sliceMark } from './spine.ts';

const pullLink = (pull: string, tokens: DirectionTokens): Element => {
  const linkTokens = { ...tokens, text: { ...tokens.text, detail: tokens.text.body } };

  return externalLink(pull, 'GitHub', linkTokens).flex_none();
};

const wrappedDetail = (text: string, tokens: DirectionTokens): Element =>
  wrappedText(text, tokens).text_size(tokens.text.detail.size).text_color(tokens.ink.dim);

const nowDetails = (slice: ActiveSlice, view: TicketView, tokens: DirectionTokens): Element => {
  const detail = view.state === 'sync-failed' ? `as of 6m ago · ${slice.detail}` : slice.detail;

  if (view.state === 'wide') {
    const details = v_flex()
      .min_w(0)
      .flex_none()
      .ml(sectionBodyInset(tokens))
      .mr(readingInset)
      .child(wrappedDetail(detail, tokens));

    if (slice.agent !== null) {
      details.child(
        h_flex().h(tokens.rows.height).items_center().child(agentLink(slice.agent, tokens)),
      );
    }

    return details;
  }

  const details = detailLine(tokens).child(
    label(detail, tokens.text.detail, tokens.ink.dim).tooltip(detail),
  );

  if (slice.agent !== null) {
    details.child(agentLink(slice.agent, tokens).flex_none());
  }

  return details;
};

const summaryLabel = (slice: Slice, view: TicketView, tokens: DirectionTokens): Element => {
  const widths = identifierWidths(view);

  return h_flex()
    .min_w(0)
    .flex_1()
    .pl(planChevronWidth + spacing.xsmall)
    .gap(spacing.small)
    .items_center()
    .child(
      identifierCell(
        slice.identifier,
        { source: view.item.source, width: widths.slice, linked: false },
        tokens,
      ),
    )
    .child(label(slice.title, tokens.text.body, tokens.ink.text).tooltip(slice.title));
};

const railTitle = (slice: Slice, view: TicketView, tokens: DirectionTokens): Element => {
  const widths = identifierWidths(view);

  return h_flex()
    .min_w(0)
    .flex_none()
    .min_h(tokens.rows.height)
    .mx(tokens.rows.inset)
    .px(tokens.rows.paddingX)
    .gap(spacing.small)
    .items_start()
    .child(sliceMark(slice, tokens).flex_none().mt(spacing.small))
    .child(
      h_flex()
        .flex_1()
        .min_w(0)
        .gap(spacing.small)
        .items_start()
        .child(
          identifierCell(
            slice.identifier,
            { source: view.item.source, width: widths.slice, linked: false },
            tokens,
          ).mt(spacing.small),
        )
        .child(wrappedText(slice.title, tokens).flex_1()),
    );
};

const railNowSlice = (slice: ActiveSlice, view: TicketView, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .pb(spacing.small)
    .child(railTitle(slice, view, tokens))
    .child(
      detailLine(tokens)
        .min_h(tokens.rows.height)
        .child(pullLink(slice.pull, tokens))
        .child(div().flex_1())
        .child(statusWord(slice.readiness, tokens)),
    )
    .child(nowDetails(slice, view, tokens));

const nowSlice = (slice: ActiveSlice, view: TicketView, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .min_w(0)
    .child(
      row(
        {
          selected: false,
          start: sliceMark(slice, tokens),
          label: summaryLabel(slice, view, tokens),
          end: [pullLink(slice.pull, tokens), statusWord(slice.readiness, tokens)],
        },
        tokens,
      ),
    )
    .child(nowDetails(slice, view, tokens));

const singleNow = (
  view: Extract<TicketView, { state: 'single' }>,
  tokens: DirectionTokens,
): Element => {
  const current = view.current;

  const parts = [
    row(
      {
        selected: false,
        start: sliceMark(current, tokens),
        label: pullLink(current.pull, tokens),
        end: [statusWord(current.readiness, tokens)],
      },
      tokens,
    ),
    nowDetails(current, view, tokens),
  ];

  const working = (view.agents[current.identifier] ?? []).filter(
    (item) => item.state === 'in progress',
  );

  const widths = identifierWidths(view);

  parts.push(
    ...working.map((item) =>
      workRow(item, { source: view.item.source, width: widths.slice, linked: false }, tokens),
    ),
  );

  return section('Now', parts, tokens);
};

export const nowBlock = (view: TicketView, tokens: DirectionTokens): Element => {
  if (view.state === 'single') {
    return singleNow(view, tokens);
  }

  const active = view.slices.filter(isActiveSlice);
  const parts: Element[] = [];

  if (active.length === 0) {
    parts.push(note('No slice in progress · waiting for ME-1290', tokens));
  }

  const renderSlice = view.state === 'wide' ? railNowSlice : nowSlice;

  parts.push(...active.map((slice) => renderSlice(slice, view, tokens)));

  return section('Now', parts, tokens);
};

const nothingReady = (tokens: DirectionTokens): Element =>
  section(
    'Next',
    [
      note('Nothing is ready', tokens),
      detailLine(tokens)
        .child(fixedLabel('ME-1285 waits for', tokens.text.detail, tokens.ink.dim))
        .child(externalLink('ME-1290', 'Linear', tokens).flex_none())
        .child(fixedLabel('Add the sidebar data model', tokens.text.detail, tokens.ink.text))
        .child(fixedLabel('·', tokens.text.detail, tokens.ink.dim))
        .child(fixedLabel('not started', tokens.text.detail, tokens.ink.dim))
        .child(fixedLabel('·', tokens.text.detail, tokens.ink.dim))
        .child(fixedLabel('no PR', tokens.text.detail, tokens.ink.dim)),
    ],
    tokens,
  );

export const nextBlock = (view: TicketView, tokens: DirectionTokens): Element => {
  const ready = view.slices.find((slice) => slice.readiness === 'ready');

  if (ready === undefined) {
    return nothingReady(tokens);
  }

  const currentReason = nextReason(ready);

  const reason =
    view.state === 'sync-failed' ? `${currentReason} (PR states from 6m ago)` : currentReason;

  if (view.state === 'wide') {
    return section(
      'Next',
      [railTitle(ready, view, tokens), detailLine(tokens).child(wrappedDetail(reason, tokens))],
      tokens,
    );
  }

  return section(
    'Next',
    [
      row(
        {
          selected: false,
          start: sliceMark(ready, tokens),
          label: summaryLabel(ready, view, tokens),
          end: [statusWord('next', tokens)],
        },
        tokens,
      ),
      note(reason, tokens),
    ],
    tokens,
  );
};
