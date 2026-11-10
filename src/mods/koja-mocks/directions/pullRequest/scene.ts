import type { Element } from 'gpui-kit';

import { agentPane, fakeTabs } from '../../scenes/shellContent.ts';
import { contentHeader } from '../content/parts.ts';
import { koja } from '../koja.ts';
import { card, cardSlot } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { DirectionTab } from '../window.ts';
import { directionWindow } from '../window.ts';
import type { PullState, PullTake } from './data.ts';
import { pullItem } from './data.ts';
import { pullBody } from './layout.ts';

export const pullRequestScene = (take: PullTake, state: PullState): Element => {
  const item = pullItem(state);
  const separateDiff = state === 'diff';
  const headerItem = separateDiff ? { ...item, name: 'Diff', icon: 'git-compare' as const } : item;
  const tokens: DirectionTokens = { ...koja, areas: { ...koja.areas, shellPaneWidth: 400 } };

  const tabs: DirectionTab[] = fakeTabs.map((tab) => ({
    label: tab.label,
    active: false,
    status: tab.status,
    program: tab.program,
  }));

  const tab = separateDiff ? '#41 Diff' : item.tab;

  tabs.push({
    label: tab,
    active: true,
    status: null,
    program: agentPane.program,
    icon: item.icon,
  });

  return directionWindow(tokens, undefined, {
    agent: state === 'blocked' ? agentPane : null,
    agentFocused: false,
    tabs,
    toggles: () => [],
    panes: (paneTokens) => [
      cardSlot(
        card(true, paneTokens)
          .child(contentHeader(headerItem, paneTokens))
          .child(pullBody(take, state, item, paneTokens)),
        paneTokens,
      ).flex_1(),
    ],
  });
};
