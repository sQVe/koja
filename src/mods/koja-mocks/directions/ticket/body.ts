import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { contentSection, contentSectionHeader, description } from '../content/parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { Slice, TicketView } from './data.ts';
import { isActiveSlice } from './data.ts';
import {
  acceptanceSection,
  activitySection,
  foldedSection,
  note,
  relationSection,
  workRow,
} from './parts.ts';
import type { SpineNode } from './spine.ts';
import { progressTrack, spine, spineSlice } from './spine.ts';
import { nextBlock, nowBlock } from './summary.ts';

const nestedInset = 12;

const planNode = (slice: Slice, view: TicketView, tokens: DirectionTokens): SpineNode => {
  const current = slice.identifier === view.currentIdentifier;
  const expanded = view.currentIdentifier === null ? isActiveSlice(slice) : current;

  const node = spineSlice(
    slice,
    {
      linked: !current,
      selected: current,
      expanded,
      source: view.item.source,
    },
    tokens,
  );

  if (expanded) {
    const agents = view.agents[slice.identifier] ?? [];

    node.content.child(
      v_flex()
        .flex_none()
        .min_w(0)
        .ml(nestedInset)
        .children(agents.map((item) => workRow(item, view.item.source, tokens))),
    );
  }

  return node;
};

const planSection = (view: TicketView, tokens: DirectionTokens): Element => {
  const nodes = view.slices.map((slice) => planNode(slice, view, tokens));

  return contentSection(
    { name: 'Whole plan', count: view.slices.length },
    [spine(nodes, tokens)],
    tokens,
  );
};

const foldedAcceptance = (view: TicketView, tokens: DirectionTokens): Element => {
  const done = view.criteria.filter((item) => item.state === 'done').length;

  return foldedSection(`Acceptance · ${done} of ${view.criteria.length}`, undefined, tokens);
};

const tailSections = (view: TicketView, tokens: DirectionTokens): Element[] => {
  if (view.currentIdentifier === null) {
    return [foldedSection('Description', undefined, tokens), foldedAcceptance(view, tokens)];
  }

  return [
    acceptanceSection(view.criteria, view.item.source, tokens),
    relationSection(tokens),
    foldedSection('Description', undefined, tokens),
    activitySection(tokens),
  ];
};

export const ticketSections = (view: TicketView, tokens: DirectionTokens): Element[] => {
  if (view.state === 'plain') {
    return [
      contentSection({ name: 'Description' }, [description(view.item, tokens)], tokens),
      acceptanceSection(view.criteria, view.item.source, tokens),
    ];
  }

  if (view.state === 'done') {
    return [
      progressTrack(view.slices, tokens),
      note('All slices merged', tokens),
      foldedSection(`${view.slices.length} merged`, undefined, tokens),
      ...tailSections(view, tokens),
    ];
  }

  const sections: Element[] = [];

  if (view.currentIdentifier !== null) {
    sections.push(contentSectionHeader({ name: 'ME-1280 Build the sidebar' }, true, [], tokens));
  }

  sections.push(progressTrack(view.slices, tokens));

  if (view.state !== 'wide') {
    sections.push(nowBlock(view, tokens), nextBlock(view, tokens));
  }

  sections.push(planSection(view, tokens), ...tailSections(view, tokens));

  return sections;
};
