import { h_flex, Scrollbar, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { stateLine } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import { agentPane, fakeTabs } from '../../scenes/shellContent.ts';
import { factRows, factsBlock } from '../content/facts.ts';
import { contentHeader, readingInset } from '../content/parts.ts';
import { koja, kojaNormal } from '../koja.ts';
import { sectionDivider } from '../panels/frame.ts';
import { card, cardSlot } from '../parts.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DirectionTab } from '../window.ts';
import { directionWindow } from '../window.ts';
import { ticketSections } from './body.ts';
import type { TicketState, TicketView } from './data.ts';
import { ticketHeading } from './heading.ts';
import { nextBlock, nowBlock } from './summary.ts';
import { ticketView } from './views.ts';

const factsRailWidth = 240;
const widePlanWidth = 480;
const railInset = 16;
const scrollbarWidth = 3;
// Extend the native bar's box so its right inset does not hide the thumb behind the clip.
const scrollbarInset = 4;
const scrollbarOpacity = 0.5;

const planBottomInset = 18;

// These insets align each fixed scene's initial fold with a row boundary.
const readingBottomInset = (state: TicketState): number => {
  if (state === 'single') {
    return spacing.medium;
  }

  if (state === 'container' || state === 'tikk' || state === 'normal') {
    return spacing.large;
  }

  return planBottomInset;
};

// These fixtures have fixed viewport sizes; the short variants fit without scrolling.
const overflowingStates = new Set<TicketState>([
  'container',
  'single',
  'sync-failed',
  'tikk',
  'long',
  'normal',
]);

const readingViewport = (reading: Element, state: TicketState, bottomInset: number): Element => {
  const viewport = v_flex().relative().mb(bottomInset).flex_1().min_h(0).min_w(0).child(reading);

  if (overflowingStates.has(state)) {
    viewport.child(
      v_flex()
        .absolute()
        .top(0)
        .bottom(0)
        .right(scrollbarInset)
        .w(scrollbarWidth)
        .overflow_hidden()
        .child(
          Scrollbar.vertical(`ticket-view-${state}`)
            .mode('always')
            .absolute()
            .inset_0()
            .right(-scrollbarInset)
            .opacity(scrollbarOpacity),
        ),
    );
  }

  return viewport;
};

const ticketBody = (view: TicketView, tokens: DirectionTokens): Element => {
  const name = `ticket-view-${view.state}`;
  const bottomInset = readingBottomInset(view.state);

  const reading = v_flex().flex_1().min_h(0).min_w(0).child(ticketHeading(view, tokens));

  if (view.state === 'loading') {
    return reading.child(
      stateLine({ kind: 'loading', text: 'Loading ticket' }).px(readingInset).mt(spacing.medium),
    );
  }

  if (view.state === 'unreachable') {
    return reading.child(
      errorLine('Could not read ticket · Linear is unreachable', tokens).mt(spacing.medium),
    );
  }

  if (view.state !== 'wide') {
    reading.child(factsBlock(view.item.facts, tokens));
  }

  if (view.state === 'sync-failed') {
    reading.child(errorLine('Could not sync PRs · showing PR states from 6m ago', tokens));
  }

  const sections = v_flex()
    .flex_none()
    .min_w(0)
    .py(spacing.xxsmall)
    .gap(spacing.xxsmall)
    .children(ticketSections(view, tokens));

  if (view.state === 'wide') {
    sections.max_w(widePlanWidth);
  }

  const scroll = v_flex()
    .id(name)
    .flex_1()
    .min_h(0)
    .min_w(0)
    .overflow_y_scroll()
    .pr(tokens.rows.inset)
    .child(sections);

  reading.child(sectionDivider(tokens)).child(readingViewport(scroll, view.state, bottomInset));

  if (view.state !== 'wide') {
    return reading;
  }

  const rail = v_flex()
    .w(factsRailWidth)
    .flex_none()
    .min_w(0)
    .py(railInset)
    .gap(spacing.medium)
    .border_l(1)
    .border_color(tokens.pane.headerDivider)
    .child(factRows(view.item.facts, tokens).mx(railInset))
    .child(nowBlock(view, tokens))
    .child(nextBlock(view, tokens));

  return h_flex().flex_1().min_h(0).min_w(0).items_stretch().child(reading).child(rail);
};

const ticketPane = (view: TicketView, tokens: DirectionTokens): Element =>
  cardSlot(
    card(true, tokens).child(contentHeader(view.item, tokens)).child(ticketBody(view, tokens)),
    tokens,
  ).flex_1();

export const ticketScene = (state: TicketState): Element => {
  const view = ticketView(state);
  const mode = state === 'normal' ? kojaNormal : koja;
  const tokens: DirectionTokens = { ...mode, areas: { ...mode.areas, shellPaneWidth: 400 } };

  const tabs: DirectionTab[] = fakeTabs.map((tab) => ({
    label: tab.label,
    active: false,
    status: tab.status,
    program: tab.program,
  }));

  tabs.push({
    label: view.item.tab,
    active: true,
    status: null,
    program: agentPane.program,
    icon: view.item.icon,
  });

  const agent =
    state === 'wide'
      ? null
      : {
          program: agentPane.program,
          name: agentPane.name,
          folder: agentPane.folder,
          status: agentPane.status,
          lines: agentPane.lines,
        };

  return directionWindow(tokens, undefined, {
    agent,
    agentFocused: false,
    tabs,
    toggles: () => [],
    panes: (look) => [ticketPane(view, look)],
  });
};
