import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { stateLine } from '../../../../kit/index.ts';
import { spacing } from '../../../../kit/size.ts';
import { agentPane, fakeTabs } from '../../scenes/shellContent.ts';
import { factRows, factsBlock } from '../content/facts.ts';
import { contentHeader, itemHeading, readingInset, scrollBody } from '../content/parts.ts';
import { koja, kojaNormal } from '../koja.ts';
import { sectionDivider } from '../panels/frame.ts';
import { card, cardSlot } from '../parts.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DirectionTab } from '../window.ts';
import { directionWindow } from '../window.ts';
import { ticketSections } from './body.ts';
import type { TicketState, TicketView } from './data.ts';
import { nextBlock, nowBlock } from './summary.ts';
import { ticketView } from './views.ts';

const factsRailWidth = 240;
const railInset = 16;

const ticketBody = (view: TicketView, tokens: DirectionTokens): Element => {
  const reading = scrollBody(`ticket-view-${view.state}`).child(itemHeading(view.item, tokens));

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

  reading
    .child(sectionDivider(tokens))
    .child(
      v_flex()
        .flex_none()
        .min_w(0)
        .py(spacing.xxsmall)
        .gap(spacing.xxsmall)
        .children(ticketSections(view, tokens)),
    );

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
