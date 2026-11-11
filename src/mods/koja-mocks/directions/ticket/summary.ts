import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { spacing } from '../../../../kit/size.ts';
import { agentLink, externalLink } from '../content/links.ts';
import { fixedLabel, label, row, statusMark } from '../parts.ts';
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

const nowDetails = (slice: ActiveSlice, tokens: DirectionTokens): Element => {
  const details = detailLine(tokens).child(
    label(slice.detail, tokens.text.detail, tokens.ink.dim).tooltip(slice.detail),
  );

  if (slice.agent !== null) {
    details.child(agentLink(slice.agent, tokens).flex_none());
  }

  return details;
};

const summaryIdentity = (
  identifier: string,
  view: TicketView,
  tokens: DirectionTokens,
): Element => {
  const widths = identifierWidths(view);

  return h_flex()
    .min_w(0)
    .flex_1()
    .pl(planChevronWidth + spacing.xsmall)
    .gap(spacing.small)
    .items_center()
    .child(
      identifierCell(
        identifier,
        { source: view.item.source, width: widths.slice, kind: 'summary' },
        tokens,
      ),
    );
};

const summaryLabel = (slice: Slice, view: TicketView, tokens: DirectionTokens): Element =>
  summaryIdentity(slice.identifier, view, tokens).child(
    label(slice.title, tokens.text.body, tokens.ink.text).tooltip(slice.title),
  );

const railTitle = (slice: Slice, tokens: DirectionTokens): Element =>
  h_flex()
    .min_w(0)
    .flex_none()
    .min_h(tokens.rows.height)
    .mx(tokens.rows.inset)
    .px(tokens.rows.paddingX)
    .gap(spacing.small)
    .items_start()
    .child(sliceMark(slice, tokens).flex_none().mt(spacing.small))
    .child(wrappedText(slice.title, tokens).flex_1());

const railMetadata = (identifier: string, facts: string[], tokens: DirectionTokens): Element =>
  detailLine(tokens)
    .flex_wrap()
    .gap_y(0)
    .children(
      [identifier, ...facts].map((fact, index) => {
        const text = index === 0 ? fact : `· ${fact}`;

        return fixedLabel(text, tokens.text.detail, tokens.ink.dim).line_height(
          `${tokens.rows.height}px`,
        );
      }),
    );

const railItem = (
  slice: ActiveSlice | Extract<Slice, { readiness: 'ready' }>,
  tokens: DirectionTokens,
): Element => {
  const detail = slice.readiness === 'ready' ? nextReason(slice) : slice.detail;
  const facts = detail.split(' · ');

  const item = v_flex()
    .flex_none()
    .min_w(0)
    .pb(spacing.small)
    .child(railTitle(slice, tokens))
    .child(railMetadata(slice.identifier, facts, tokens));

  if (slice.readiness === 'ready') {
    return item;
  }

  item.child(
    detailLine(tokens)
      .min_h(tokens.rows.height)
      .child(pullLink(slice.pull, tokens))
      .child(div().flex_1())
      .child(statusWord(slice.readiness, tokens)),
  );

  if (slice.agent !== null) {
    item.child(detailLine(tokens).h(tokens.rows.height).child(agentLink(slice.agent, tokens)));
  }

  return item;
};

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
    .child(nowDetails(slice, tokens));

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
    nowDetails(current, tokens),
  ];

  const working = (view.agents[current.identifier] ?? []).filter(
    (item) => item.state === 'in progress',
  );

  const widths = identifierWidths(view);

  parts.push(
    ...working.map((item) =>
      workRow(item, { source: view.item.source, width: widths.slice, kind: 'summary' }, tokens),
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
    parts.push(note('No slice in progress', tokens));
  }

  parts.push(
    ...active.map((slice) => {
      if (view.state === 'wide') {
        return railItem(slice, tokens);
      }

      return nowSlice(slice, view, tokens);
    }),
  );

  return section('Now', parts, tokens);
};

const nothingReady = (view: TicketView, tokens: DirectionTokens): Element =>
  section(
    'Next',
    [
      row(
        {
          selected: false,
          start: statusMark('blocked', tokens),
          label: summaryIdentity('ME-1285', view, tokens)
            .child(fixedLabel('waits for', tokens.text.detail, tokens.ink.dim))
            .child(externalLink('ME-1290', 'Linear', tokens).flex_none()),
          end: [],
        },
        tokens,
      ),
      note('Add the sidebar data model · outside this plan · not started · no PR', tokens),
    ],
    tokens,
  );

export const nextBlock = (view: TicketView, tokens: DirectionTokens): Element => {
  const ready = view.slices.find((slice) => slice.readiness === 'ready');

  if (ready === undefined) {
    return nothingReady(view, tokens);
  }

  const reason = nextReason(ready);

  if (view.state === 'wide') {
    return section('Next', [railItem(ready, tokens)], tokens);
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
