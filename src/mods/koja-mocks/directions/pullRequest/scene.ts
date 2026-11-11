import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { agentPane, fakeTabs } from '../../scenes/shellContent.ts';
import { contentHeader } from '../content/parts.ts';
import { koja, kojaNormal } from '../koja.ts';
import { card, cardSlot } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { directionWindow } from '../window.ts';
import { mergeConfirm } from './actions.ts';
import type { PullScene } from './data.ts';
import { pullItem, pullViews } from './data.ts';
import { pullBody } from './layout.ts';

export const pullRequestScene = (name: PullScene): Element => {
  const view = pullViews[name];
  const item = pullItem(view);
  const mode = view.state === 'normal' ? kojaNormal : koja;
  const tokens: DirectionTokens = { ...mode, areas: { ...mode.areas, shellPaneWidth: 400 } };

  const window = directionWindow(tokens, undefined, {
    agent: view.state === 'zoomed' ? null : agentPane,
    agentFocused: false,
    tabs: fakeTabs,
    toggles: () => [],
    panes: (paneTokens) => [
      cardSlot(
        card(true, paneTokens)
          .child(contentHeader(item, paneTokens))
          .child(pullBody(view, item, paneTokens)),
        paneTokens,
      ).flex_1(),
    ],
  });

  if (view.state !== 'merge-confirm') {
    return window;
  }

  return v_flex().relative().flex_1().min_h(0).child(window).child(mergeConfirm(tokens));
};
