import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { PaneHeaderOptions } from '../../../kit/index.ts';
import {
  colors,
  controlSize,
  icon,
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
import { createMixState, mixCard, paneClearance } from '../directions/attention/mix.ts';
import { contentPane } from '../directions/content/scene.ts';
import { contentViews } from '../directions/content/states.ts';
import { dialogLayer } from '../directions/dialogs/scene.ts';
import { draftItem } from '../directions/draftReview/data.ts';
import { draftReviewPane } from '../directions/draftReview/scene.ts';
import { koja, kojaNormal } from '../directions/koja.ts';
import { commandPalette } from '../directions/overlays/palette.ts';
import { spacePanel } from '../directions/panels/space.ts';
import { spaceStates } from '../directions/panels/spaceData.ts';
import { mapSidebar } from '../directions/sidebars/sidebar.ts';
import type { DirectionTokens } from '../directions/tokens.ts';
import type { FakeTab } from './shellContent.ts';
import { agentPane, fakeTabs, shellPane } from './shellContent.ts';

interface ShellOptions {
  activeTab?: Element;
  spacePanelOpen?: boolean;
  mode?: 'Insert' | 'Normal';
}

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

const tabBar = (options: ShellOptions): Element => {
  const tabs = fakeTabs.map((fakeTab) => {
    const active = options.activeTab === undefined && fakeTab.active;

    return tabElement({ ...fakeTab, active });
  });

  if (options.activeTab !== undefined) {
    tabs.push(options.activeTab);
  }

  return h_flex()
    .h(controlSize.tabBar)
    .flex_none()
    .px(spacing.xsmall)
    .gap(spacing.xxsmall)
    .items_center()
    .children(tabs)
    .child(h_flex().flex_1())
    .child(iconButton({ name: 'plus' }))
    .child(modePill({ label: options.mode ?? 'Normal' }))
    .child(
      iconToggle({ name: 'panel-right', label: 'Space', active: options.spacePanelOpen !== false }),
    );
};

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

const main = (panes: Element[], options: ShellOptions): Element => {
  const body = h_flex().flex_1().min_h(0).gap(spacing.small).p(spacing.small).children(panes);

  if (options.spacePanelOpen !== false) {
    body.child(spacePanel(spaceStates.base, koja));
  }

  return v_flex().flex_1().h_full().min_w(0).min_h(0).child(tabBar(options)).child(body);
};

const shellWindow = (panes: Element[] = shellPanes(), options: ShellOptions = {}): Element =>
  h_flex().flex_1().min_h(0).bg(colors().chrome).child(sidebar()).child(main(panes, options));

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
          .left(paneClearance)
          .right(paneClearance)
          .bottom(paneClearance)
          .justify_center()
          .child(card.w_full()),
      );
  }

  return v_flex().relative().flex_1().min_h(0).child(shellWindow(panes));
};

export const shellContentScene = (): Element =>
  v_flex().relative().flex_1().min_h(0).child(shellWindow(contentPanes()));

export const shellDraftReviewScene = (): Element => {
  const activeTab = tab({
    label: draftItem.tab,
    active: true,
    icon: icon(draftItem.icon, 'small').text_color(colors().foreground),
    status: null,
    close: iconButton({ name: 'x', size: 'small' }),
  });

  return v_flex()
    .relative()
    .flex_1()
    .min_h(0)
    .child(
      shellWindow([draftReviewPane('comment', koja)], {
        activeTab,
        spacePanelOpen: false,
        mode: 'Insert',
      }),
    );
};

export const shellDialogScene = (): Element =>
  v_flex()
    .relative()
    .flex_1()
    .min_h(0)
    .child(shellWindow())
    .child(dialogLayer('close', kojaNormal));
