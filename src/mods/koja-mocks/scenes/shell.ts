import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { PaneHeaderOptions } from '../../../kit/index.ts';
import {
  colors,
  controlSize,
  iconButton,
  iconToggle,
  modePill,
  paneHeader,
  programIcon,
  radius,
  roleText,
  shellSize,
  spacing,
  tab,
} from '../../../kit/index.ts';
import type { MixState } from '../directions/attention/mix.ts';
import { createMixState, mixCard } from '../directions/attention/mix.ts';
import { contentPane } from '../directions/content/scene.ts';
import { contentViews } from '../directions/content/states.ts';
import { dialogLayer } from '../directions/dialogs/scene.ts';
import { koja, kojaNormal } from '../directions/koja.ts';
import { commandPalette } from '../directions/overlays/palette.ts';
import { spacePanel } from '../directions/panels/space.ts';
import { spaceStates } from '../directions/panels/spaceData.ts';
import { mapSidebar } from '../directions/sidebars/sidebar.ts';
import type { DirectionTokens } from '../directions/tokens.ts';
import type { FakeTab } from './shellContent.ts';
import { agentPane, fakeTabs, shellPane } from './shellContent.ts';

const attentionClearance = 16;

const sidebar = (): Element => mapSidebar(koja);

const tabElement = (fakeTab: FakeTab): Element => {
  const palette = colors();
  const bright = fakeTab.active;
  const iconColor = bright ? palette.foreground : palette.dim;

  return tab({
    label: fakeTab.label,
    active: fakeTab.active,
    icon: programIcon(fakeTab.program, 'small').text_color(iconColor),
    status: fakeTab.status,
    close: iconButton({ name: 'x', size: 'small' }),
  });
};

const tabBar = (): Element =>
  h_flex()
    .h(controlSize.tabBar)
    .flex_none()
    .px(spacing.xsmall)
    .gap(spacing.xxsmall)
    .items_center()
    .children(fakeTabs.map(tabElement))
    .child(h_flex().flex_1())
    .child(iconButton({ name: 'plus' }))
    .child(modePill({ label: 'Normal' }))
    .child(iconToggle({ name: 'panel-right', label: 'Space', active: true }));

const terminalBody = (lines: string[]): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .p(spacing.medium)
    .gap(spacing.xxsmall)
    .font_family('JetBrains Mono')
    .children(lines.map((line) => roleText('detail', line, 'foreground')));

const paneCard = (header: PaneHeaderOptions, lines: string[], grow: number): Element => {
  const palette = colors();

  return v_flex()
    .flex_grow(grow)
    .flex_shrink(1)
    .flex_basis(0)
    .min_w(0)
    .h_full()
    .rounded(radius.dialog)
    .border(spacing.hairline)
    .border_color(header.focused ? palette.accent : palette.selected)
    .bg(palette.background)
    .overflow_hidden()
    .child(paneHeader(header))
    .child(terminalBody(lines));
};

const shellPanes = (): Element[] => [
  paneCard(
    {
      ...agentPane,
      focused: true,
      zoomed: false,
      width: shellSize.focusedPaneWidth,
    },
    agentPane.lines,
    shellSize.focusedPaneShare,
  ),
  paneCard(
    {
      ...shellPane,
      focused: false,
      zoomed: false,
      width: shellSize.shellPaneWidth,
    },
    shellPane.lines,
    shellSize.shellPaneShare,
  ),
];

const contentPanes = (): Element[] => [
  paneCard(
    {
      ...agentPane,
      focused: false,
      zoomed: false,
      width: shellSize.shellPaneWidth,
    },
    agentPane.lines,
    1,
  ),
  contentPane(contentViews.pr, koja),
];

const main = (panes: Element[]): Element =>
  v_flex()
    .flex_1()
    .h_full()
    .min_w(0)
    .min_h(0)
    .child(tabBar())
    .child(
      h_flex()
        .flex_1()
        .min_h(0)
        .gap(spacing.small)
        .p(spacing.small)
        .children(panes)
        .child(spacePanel(spaceStates.base, koja)),
    );

const shellWindow = (panes: Element[] = shellPanes()): Element =>
  h_flex().flex_1().min_h(0).bg(colors().chrome).child(sidebar()).child(main(panes));

export const shellScene = (): Element =>
  v_flex().relative().flex_1().min_h(0).child(shellWindow()).child(commandPalette(koja));

export const shellAttentionScene = (
  open: boolean,
  tokens: DirectionTokens,
  state: MixState = createMixState(),
): Element => {
  const panes = shellPanes();
  const card = mixCard(open, tokens, state);
  const focusedPane = panes[0];

  if (card !== null && focusedPane !== undefined) {
    focusedPane
      .relative()
      .child(
        h_flex()
          .absolute()
          .left(attentionClearance)
          .right(attentionClearance)
          .bottom(attentionClearance)
          .justify_center()
          .child(card.w_full()),
      );
  }

  return v_flex().relative().flex_1().min_h(0).child(shellWindow(panes));
};

export const shellContentScene = (): Element =>
  v_flex().relative().flex_1().min_h(0).child(shellWindow(contentPanes()));

export const shellDialogScene = (): Element =>
  v_flex()
    .relative()
    .flex_1()
    .min_h(0)
    .child(shellWindow())
    .child(dialogLayer('close', kojaNormal));
