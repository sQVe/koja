import type { Element } from 'gpui-kit';

import type { FakePane } from '../../scenes/shellContent.ts';
import { agentPane, fakeTabs } from '../../scenes/shellContent.ts';
import { koja, kojaNormal } from '../koja.ts';
import { card, cardSlot } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DirectionTab } from '../window.ts';
import { directionWindow } from '../window.ts';
import { contentBody } from './layouts.ts';
import { contentHeader } from './parts.ts';
import type { ContentSceneName, ContentView } from './states.ts';
import { contentViews } from './states.ts';

const contentAgent: FakePane = {
  program: agentPane.program,
  name: agentPane.name,
  folder: agentPane.folder,
  status: agentPane.status,
  lines: agentPane.lines,
};

const contentPane = (view: ContentView, tokens: DirectionTokens): Element =>
  cardSlot(
    card(true, tokens).child(contentHeader(view.item, tokens)).child(contentBody(view, tokens)),
    tokens,
  ).flex_1();

export const contentScene = (name: ContentSceneName): Element => {
  const view = contentViews[name];
  const { item } = view;
  const mode = view.normal ? kojaNormal : koja;

  const contentTokens: DirectionTokens = {
    ...mode,
    areas: { ...mode.areas, shellPaneWidth: 400 },
  };

  const tabs: DirectionTab[] = fakeTabs.map((tab) => ({
    label: tab.label,
    active: false,
    status: tab.status,
    program: tab.program,
  }));

  tabs.push({
    label: item.tab,
    active: true,
    status: null,
    program: agentPane.program,
    icon: item.icon,
  });

  return directionWindow(contentTokens, undefined, {
    agent: view.wide ? null : contentAgent,
    agentFocused: false,
    tabs,
    toggles: () => [],
    panes: (tokens) => [contentPane(view, tokens)],
  });
};
