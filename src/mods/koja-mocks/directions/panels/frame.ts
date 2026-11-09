import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { card, cardSlot, fixedLabel, iconToggle, paneHeaderFrame } from '../parts.ts';
import { dimFact, groupHeader } from '../sidebars/facts.ts';
import { togglePill } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { PanelArrangement } from '../window.ts';

export interface PanelTab {
  name: string;
  active: boolean;
  alerts: Element[];
}

interface SectionLook {
  name: string;
  open: boolean;
  detail: Element[];
  end: Element[];
}

const tabGap = 2;
const tabMarkGap = 4;
const chevronWidth = 12;
const sectionGap = 6;
const countGap = 6;

// The live panel column is 368 px wide; the shell scene keeps its narrower panel.
export const panelWidth = 368;

export const oneCard = (drawCard: (tokens: DirectionTokens) => Element): PanelArrangement => ({
  toggles: (tokens) => [iconToggle('panel-right', true, tokens)],
  panes: (tokens) => [drawCard(tokens)],
});

export const groupLabel = (name: string, count: number, tokens: DirectionTokens): Element =>
  groupHeader(name, tokens).child(dimFact(String(count), tokens).ml(countGap));

export const panelCard = (parts: Element[], width: number, tokens: DirectionTokens): Element =>
  cardSlot(card(false, tokens).children(parts), tokens).w(width).flex_none();

export const spacer = (): Element => div().flex_1().min_h(0);

export const panelHeader = (start: Element[], end: Element[], tokens: DirectionTokens): Element =>
  paneHeaderFrame(tokens).children(start).child(h_flex().flex_1()).children(end);

export const panelTitle = (name: string, tokens: DirectionTokens): Element =>
  fixedLabel(name, tokens.text.title, tokens.ink.text);

const tabPill = (tab: PanelTab, tokens: DirectionTokens): Element =>
  togglePill(tab.name, tab.active, tokens)
    .gap(tabMarkGap)
    .children(tab.active ? [] : tab.alerts);

// The pills sit at the row inset, so the tab text lines up with the row text below.
export const tabStrip = (tabs: PanelTab[], end: Element[], tokens: DirectionTokens): Element =>
  panelHeader(
    tabs.map((tab) => tabPill(tab, tokens)),
    end,
    tokens,
  )
    .pl(tokens.rows.inset)
    .gap(tabGap);

export const sectionHeaderOf = (
  title: Element,
  look: Omit<SectionLook, 'name'>,
  tokens: DirectionTokens,
): Element => {
  const { rows } = tokens;
  const chevron = look.open ? 'chevron-down' : 'chevron-right';

  return h_flex()
    .h(rows.height)
    .flex_none()
    .min_w(0)
    .mx(rows.inset)
    .px(rows.paddingX)
    .gap(sectionGap)
    .items_center()
    .rounded(rows.radius)
    .hover((hovered) => hovered.bg(rows.hoverFill))
    .child(
      h_flex()
        .w(chevronWidth)
        .flex_none()
        .justify_center()
        .child(icon(chevron, 'xsmall').text_color(tokens.ink.dim)),
    )
    .child(title)
    .children(look.detail)
    .child(h_flex().flex_1())
    .children(look.end);
};

export const sectionHeader = (look: SectionLook, tokens: DirectionTokens): Element =>
  sectionHeaderOf(fixedLabel(look.name, tokens.text.heading, tokens.ink.text), look, tokens);

export const sectionDivider = (tokens: DirectionTokens): Element =>
  div().h(1).flex_none().bg(tokens.pane.headerDivider);

export const panelColumn = (parts: Element[]): Element =>
  v_flex().flex_1().min_h(0).overflow_hidden().children(parts);
