import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { spacing } from '../../../../kit/size.ts';
import { agentLink, externalLink } from '../content/links.ts';
import { readingInset, sectionBodyInset } from '../content/parts.ts';
import { fixedLabel, label, row, statusMark } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { ActiveSlice, TicketView } from './data.ts';
import { isActiveSlice } from './data.ts';
import { detailLine, note, planLink, section, wrappedText } from './parts.ts';
import { sliceMark } from './spine.ts';

const pullLink = (pull: string, tokens: DirectionTokens): Element => {
  const linkTokens = { ...tokens, text: { ...tokens.text, detail: tokens.text.body } };

  return externalLink(pull, 'GitHub', linkTokens).flex_none();
};

const wrappedDetail = (text: string, tokens: DirectionTokens): Element =>
  wrappedText(text, tokens).text_size(tokens.text.detail.size).text_color(tokens.ink.dim);

const nowDetails = (slice: ActiveSlice, rail: boolean, tokens: DirectionTokens): Element => {
  if (rail) {
    const details = v_flex()
      .min_w(0)
      .flex_none()
      .ml(sectionBodyInset(tokens))
      .mr(readingInset)
      .child(wrappedDetail(slice.detail, tokens));

    if (slice.agent !== null) {
      details.child(agentLink(slice.agent, tokens));
    }

    return details;
  }

  const details = detailLine(tokens).child(
    label(slice.detail, tokens.text.detail, tokens.ink.dim).tooltip(slice.detail),
  );

  if (slice.agent !== null) {
    details.child(agentLink(slice.agent, tokens).flex_none());
  }

  return details;
};

const railTitle = (title: string, mark: Element, tokens: DirectionTokens): Element =>
  h_flex()
    .min_w(0)
    .flex_none()
    .min_h(tokens.rows.height)
    .mx(tokens.rows.inset)
    .px(tokens.rows.paddingX)
    .gap(spacing.small)
    .items_start()
    .child(mark.flex_none().mt(spacing.small))
    .child(wrappedText(title, tokens).flex_1());

const railNowSlice = (slice: ActiveSlice, tokens: DirectionTokens): Element => {
  const pull = detailLine(tokens);

  if (slice.readiness !== 'in progress') {
    pull.child(pullLink(slice.pull, tokens));
  }

  pull.child(div().flex_1()).child(fixedLabel(slice.readiness, tokens.text.detail, tokens.ink.dim));

  return v_flex()
    .flex_none()
    .min_w(0)
    .pb(spacing.small)
    .child(railTitle(slice.title, sliceMark(slice, tokens), tokens))
    .child(pull)
    .child(nowDetails(slice, true, tokens));
};

const nowSlice = (slice: ActiveSlice, tokens: DirectionTokens): Element => {
  const end: Element[] = [];

  if (slice.readiness !== 'in progress') {
    end.push(pullLink(slice.pull, tokens));
  }

  end.push(fixedLabel(slice.readiness, tokens.text.detail, tokens.ink.dim));

  return v_flex()
    .flex_none()
    .min_w(0)
    .child(
      row(
        {
          selected: false,
          start: sliceMark(slice, tokens),
          label: label(slice.title, tokens.text.body, tokens.ink.text).tooltip(slice.title),
          end,
        },
        tokens,
      ),
    )
    .child(nowDetails(slice, false, tokens));
};

const singleNow = (
  view: Extract<TicketView, { state: 'single' }>,
  tokens: DirectionTokens,
): Element => {
  const current = view.current;

  const title =
    current.readiness === 'in progress'
      ? label(current.title, tokens.text.body, tokens.ink.text)
      : pullLink(current.pull, tokens);

  const parts = [
    row(
      {
        selected: false,
        start: sliceMark(current, tokens),
        label: title,
        end: [fixedLabel(current.readiness, tokens.text.detail, tokens.ink.dim)],
      },
      tokens,
    ),
    nowDetails(current, false, tokens),
  ];

  const working = (view.agents[current.identifier] ?? []).filter(
    (item) => item.state === 'in progress',
  );

  parts.push(
    ...working.map((item) =>
      row(
        {
          selected: false,
          start: statusMark('working', tokens),
          label: label(`${item.identifier} ${item.title}`, tokens.text.body, tokens.ink.text),
          end: [fixedLabel(item.state, tokens.text.detail, tokens.ink.dim)],
        },
        tokens,
      ),
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
    parts.push(note('No slices in progress', tokens));
  }

  const renderSlice = view.state === 'wide' ? railNowSlice : nowSlice;

  parts.push(...active.map((slice) => renderSlice(slice, tokens)));

  return section('Now', parts, tokens);
};

const nothingReady = (tokens: DirectionTokens): Element =>
  section(
    'Next',
    [
      note('Nothing is ready', tokens),
      detailLine(tokens)
        .child(fixedLabel('ME-1285 waits for', tokens.text.detail, tokens.ink.dim))
        .child(planLink('ME-1290', 'Linear', tokens).flex_none())
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

  const reason = `Ready · waits on ${ready.waitsFor}, stacks on koja ${ready.stack}`;

  if (view.state === 'wide') {
    return section(
      'Next',
      [
        railTitle(ready.title, sliceMark(ready, tokens), tokens),
        note('next', tokens),
        detailLine(tokens).child(wrappedDetail(reason, tokens)),
      ],
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
          label: label(ready.title, tokens.text.body, tokens.ink.text).tooltip(ready.title),
          end: [fixedLabel('next', tokens.text.detail, tokens.ink.dim)],
        },
        tokens,
      ),
      note(reason, tokens),
    ],
    tokens,
  );
};
