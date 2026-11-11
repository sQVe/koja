import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { spacing } from '../../../../kit/size.ts';
import type { SourceTarget } from '../content/data.ts';
import { externalLink } from '../content/links.ts';
import { contentSection } from '../content/parts.ts';
import { fixedLabel, label, row, statusMark, styled } from '../parts.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { Slice, TicketView } from './data.ts';
import { isActiveSlice } from './data.ts';
import { detailLine, note, pullRow } from './parts.ts';
import { sliceMark, sliceName } from './spine.ts';

const markSlotWidth = 12;
const railDetailLineHeight = 16;
const railDetailLineLength = `${railDetailLineHeight}px`;

const railNote = (text: string, tokens: DirectionTokens): Element =>
  detailLine(tokens).child(
    styled(
      div()
        .flex_1()
        .min_w(0)
        .whitespace_normal()
        .line_height(railDetailLineLength)
        .max_h(railDetailLineHeight * 2)
        .overflow_hidden(),
      tokens.text.detail,
      tokens.ink.dim,
    )
      .child(text)
      .tooltip(text),
  );

const railNowSlice = (slice: Slice, source: SourceTarget, tokens: DirectionTokens): Element => {
  const pull = detailLine(tokens);

  if (slice.pull !== undefined) {
    pull.child(externalLink(slice.pull, 'GitHub', tokens).flex_none());
  }

  pull.child(div().flex_1()).child(fixedLabel(slice.readiness, tokens.text.detail, tokens.ink.dim));

  return v_flex()
    .flex_none()
    .min_w(0)
    .pb(spacing.small)
    .child(
      row(
        {
          selected: false,
          start: sliceMark(slice, tokens),
          label: sliceName(slice, false, source, tokens),
          end: [],
        },
        tokens,
      ),
    )
    .child(pull)
    .child(
      railNote(`${slice.tracker} · PR ${slice.pullState ?? ''} · ${slice.detail ?? ''}`, tokens),
    );
};

const nowSlice = (slice: Slice, source: SourceTarget, tokens: DirectionTokens): Element => {
  const end: Element[] = [];

  if (slice.pull !== undefined) {
    end.push(externalLink(slice.pull, 'GitHub', tokens).flex_none());
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
          label: sliceName(slice, false, source, tokens),
          end,
        },
        tokens,
      ),
    )
    .child(note(`${slice.tracker} · PR ${slice.pullState ?? ''} · ${slice.detail ?? ''}`, tokens));
};

const singleNow = (view: TicketView, tokens: DirectionTokens): Element => {
  const current = view.slices.find((slice) => slice.identifier === view.currentIdentifier);

  if (current === undefined) {
    throw new Error('The single-ticket fixture has no current slice in its parent plan');
  }

  const parts: Element[] = [];

  if (current.pull !== undefined) {
    parts.push(pullRow(current.pull, current.pullState ?? '', current.tracker, tokens));
  }

  if (current.detail !== undefined) {
    parts.push(note(current.detail, tokens));
  }

  const agents = view.agents[current.identifier] ?? [];
  const working = agents.filter((item) => item.state === 'in progress');

  parts.push(
    ...working.map((item) =>
      row(
        {
          selected: false,
          start: statusMark('working', tokens),
          label: label(`${item.identifier ?? ''} ${item.title}`, tokens.text.body, tokens.ink.text),
          end: [fixedLabel(item.state, tokens.text.detail, tokens.ink.dim)],
        },
        tokens,
      ),
    ),
  );

  return contentSection({ name: 'Now' }, parts, tokens);
};

export const nowBlock = (view: TicketView, tokens: DirectionTokens): Element => {
  if (view.currentIdentifier !== null) {
    return singleNow(view, tokens);
  }

  const active = view.slices.filter(isActiveSlice);
  const parts: Element[] = [];

  if (view.state === 'sync-failed') {
    parts.push(errorLine('Could not sync PRs · showing PR states from 6m ago', tokens));
  }

  if (active.length === 0) {
    parts.push(note('No slices in progress', tokens));
  }

  const renderSlice = view.state === 'wide' ? railNowSlice : nowSlice;

  parts.push(...active.map((slice) => renderSlice(slice, view.item.source, tokens)));

  return contentSection({ name: 'Now' }, parts, tokens);
};

const nothingReady = (tokens: DirectionTokens): Element =>
  contentSection(
    { name: 'Next' },
    [
      note('Nothing is ready', tokens),
      detailLine(tokens)
        .child(fixedLabel('ME-1285 is blocked by', tokens.text.detail, tokens.ink.dim))
        .child(externalLink('ME-1290', 'Linear', tokens))
        .child(fixedLabel('· no PR', tokens.text.detail, tokens.ink.dim)),
    ],
    tokens,
  );

export const nextBlock = (view: TicketView, tokens: DirectionTokens): Element => {
  const ready = view.slices.find((slice) => slice.readiness === 'ready');

  if (ready === undefined) {
    return nothingReady(tokens);
  }

  let reason = `${ready.tracker} · ${ready.detail ?? ''}`;

  if (view.state === 'sync-failed') {
    reason += ' · uses PR states from 6m ago';
  }

  const detail = view.state === 'wide' ? railNote(reason, tokens) : note(reason, tokens);

  return contentSection(
    { name: 'Next' },
    [
      row(
        {
          selected: false,
          start: h_flex()
            .w(markSlotWidth)
            .items_center()
            .justify_center()
            .child(sliceMark(ready, tokens)),
          label: sliceName(ready, false, view.item.source, tokens),
          end: [fixedLabel('next', tokens.text.detail, tokens.ink.dim)],
        },
        tokens,
      ),
      detail,
    ],
    tokens,
  );
};
