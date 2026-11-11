import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { description } from '../content/parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { Slice, TicketView } from './data.ts';
import { isActiveSlice } from './data.ts';
import {
  acceptanceSection,
  activitySection,
  agentIndent,
  identifierWidths,
  nextReason,
  foldedSection,
  note,
  relationSection,
  section,
  sectionHeader,
  workRow,
} from './parts.ts';
import type { SpineNode } from './spine.ts';
import { progressTrack, spine, spineSlice } from './spine.ts';
import { nextBlock, nowBlock } from './summary.ts';

const disclosureFor = (children: number, expanded: boolean): 'none' | 'open' | 'closed' => {
  if (children === 0) {
    return 'none';
  }

  return expanded ? 'open' : 'closed';
};

const planReason = (slice: Slice, view: TicketView): string | null => {
  if (slice.readiness === 'blocked') {
    return `waits for ${slice.blockedBy}`;
  }

  if (view.state === 'single' && slice.readiness === 'ready') {
    return nextReason(slice);
  }

  return null;
};

const planNode = (slice: Slice, view: TicketView, tokens: DirectionTokens): SpineNode => {
  const current = view.state === 'single' && slice.identifier === view.current.identifier;
  const firstActive = view.slices.find(isActiveSlice)?.identifier;
  const expanded = view.state === 'single' ? current : slice.identifier === firstActive;
  const agents = view.agents[slice.identifier] ?? [];
  const widths = identifierWidths(view);
  const reason = planReason(slice, view);
  const kind = current ? 'current' : 'linked';
  const disclosure = disclosureFor(agents.length, expanded);

  const node = spineSlice(
    slice,
    { kind, disclosure, source: view.item.source, identifierWidth: widths.slice, reason },
    tokens,
  );

  if (expanded) {
    node.content.child(
      v_flex()
        .flex_none()
        .min_w(0)
        .ml(agentIndent)
        .children(
          agents.map((item) =>
            workRow(
              item,
              { source: view.item.source, width: widths.agent, kind: 'linked' },
              tokens,
            ),
          ),
        ),
    );
  }

  return node;
};

const planSection = (view: TicketView, tokens: DirectionTokens): Element => {
  const name = view.state === 'single' ? 'Parent plan' : 'Whole plan';

  const count =
    view.state === 'single'
      ? 'ME-1280 Build the sidebar'
      : `${view.slices.length} in ${view.item.source}`;

  const plan = v_flex()
    .flex_none()
    .min_w(0)
    .child(sectionHeader({ name, count }, true, tokens));

  if (view.state === 'single') {
    plan.child(progressTrack(view.slices, tokens));
  }

  const nodes = view.slices.map((slice) => planNode(slice, view, tokens));

  return plan.child(spine(nodes, tokens));
};

const foldedAcceptance = (view: TicketView, tokens: DirectionTokens): Element => {
  const done = view.criteria.filter((item) => item.state === 'done').length;
  const count = `${done} of ${view.criteria.length}`;

  return foldedSection('Acceptance', count, tokens);
};

const containerTail = (view: TicketView, tokens: DirectionTokens): Element[] => [
  foldedSection('Description', null, tokens),
  foldedAcceptance(view, tokens),
];

export const ticketSections = (view: TicketView, tokens: DirectionTokens): Element[] => {
  if (view.state === 'plain') {
    return [
      section('Description', [description(view.item, tokens)], tokens),
      acceptanceSection(view.criteria, tokens),
    ];
  }

  if (view.state === 'done') {
    return [
      progressTrack(view.slices, tokens),
      note('All slices merged', tokens),
      foldedSection('merged', String(view.slices.length), tokens),
      ...containerTail(view, tokens),
    ];
  }

  if (view.state === 'single') {
    return [
      nowBlock(view, tokens),
      acceptanceSection(view.criteria, tokens),
      planSection(view, tokens),
      relationSection(tokens),
      foldedSection('Description', null, tokens),
      activitySection(tokens),
    ];
  }

  const sections = [progressTrack(view.slices, tokens)];

  if (view.state !== 'wide') {
    sections.push(nowBlock(view, tokens), nextBlock(view, tokens));
  }

  sections.push(planSection(view, tokens), ...containerTail(view, tokens));

  return sections;
};
