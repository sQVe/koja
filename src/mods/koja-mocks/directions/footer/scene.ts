import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { FakePane } from '../../scenes/shellContent.ts';
import { agentPane, shellPane } from '../../scenes/shellContent.ts';
import { koja, kojaNormal } from '../koja.ts';
import { cardSlot, iconToggle } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { directionWindow } from '../window.ts';
import { reviewPane } from './data.ts';
import type { FooterFit, FooterLook, PaneFocus } from './pane.ts';
import { footerPane, footerSidePanel } from './pane.ts';

// `pending` holds the count and prefix typed so far, and is empty when no key is pending.
type Keyboard = { mode: 'insert' } | { mode: 'normal'; pending: string };

type SplitPlace = 'upper' | 'lower' | 'beside';

// How far each pane's footer has narrowed at its width in the scene.
type Layout =
  | { kind: 'shell'; agentFit: FooterFit }
  | { kind: 'lone' }
  | { kind: 'split'; focused: SplitPlace; fits: Record<SplitPlace, FooterFit> };

interface FooterScene {
  layout: Layout;
  keyboard: Keyboard;
}

const shell: Layout = { kind: 'shell', agentFit: 'branchCut' };

const footerScenes = {
  insert: { layout: shell, keyboard: { mode: 'insert' } },
  normal: { layout: shell, keyboard: { mode: 'normal', pending: '' } },
  pending: { layout: shell, keyboard: { mode: 'normal', pending: '3s' } },
  split: {
    layout: {
      kind: 'split',
      focused: 'beside',
      fits: { upper: 'folderDropped', lower: 'full', beside: 'folderDropped' },
    },
    keyboard: { mode: 'insert' },
  },
  'split-normal': {
    layout: {
      kind: 'split',
      focused: 'upper',
      fits: { upper: 'branchCut', lower: 'full', beside: 'full' },
    },
    keyboard: { mode: 'normal', pending: 'g' },
  },
  lone: { layout: { kind: 'lone' }, keyboard: { mode: 'insert' } },
} satisfies Record<string, FooterScene>;

export type FooterSceneName = keyof typeof footerScenes;

const tokensOf = (keyboard: Keyboard): DirectionTokens =>
  keyboard.mode === 'normal' ? kojaNormal : koja;

const focusOf = (keyboard: Keyboard): PaneFocus => ({
  focused: true,
  pending: keyboard.mode === 'normal' ? keyboard.pending : '',
});

const unfocused: PaneFocus = { focused: false };

const wideSlot = (inner: Element, tokens: DirectionTokens): Element =>
  cardSlot(inner, tokens).flex_1();

const shellPanes = (
  agentFit: FooterFit,
  keyboard: Keyboard,
  tokens: DirectionTokens,
): Element[] => [
  wideSlot(footerPane(agentPane, { focus: focusOf(keyboard), fit: agentFit }, tokens), tokens),
  cardSlot(footerPane(shellPane, { focus: unfocused, fit: 'full' }, tokens), tokens)
    .w(tokens.areas.shellPaneWidth)
    .flex_none(),
  footerSidePanel(tokens),
];

const splitPanes = (
  layout: Extract<Layout, { kind: 'split' }>,
  keyboard: Keyboard,
  tokens: DirectionTokens,
): Element[] => {
  const placed = (place: SplitPlace, fakePane: FakePane): Element => {
    const focus = place === layout.focused ? focusOf(keyboard) : unfocused;

    return footerPane(fakePane, { focus, fit: layout.fits[place] }, tokens);
  };

  const stack = v_flex()
    .flex_1()
    .h_full()
    .min_w(0)
    .gap(tokens.areas.contentGap)
    .child(placed('upper', agentPane))
    .child(placed('lower', shellPane));

  return [stack, wideSlot(placed('beside', reviewPane), tokens)];
};

const panesOf = (scene: FooterScene, tokens: DirectionTokens): Element[] => {
  const { keyboard, layout } = scene;

  if (layout.kind === 'shell') {
    return shellPanes(layout.agentFit, keyboard, tokens);
  }

  if (layout.kind === 'split') {
    return splitPanes(layout, keyboard, tokens);
  }

  const look = { focus: focusOf(keyboard), fit: 'full' } satisfies FooterLook;

  return [wideSlot(footerPane(agentPane, look, tokens), tokens)];
};

export const footerScene = (name: FooterSceneName): Element => {
  const scene: FooterScene = footerScenes[name];
  const panelOpen = scene.layout.kind === 'shell';

  return directionWindow(tokensOf(scene.keyboard), undefined, {
    agent: null,
    modeMark: 'paneFooter',
    toggles: (tokens) => [
      iconToggle('git-compare', panelOpen, tokens),
      iconToggle('folder', false, tokens),
    ],
    panes: (tokens) => panesOf(scene, tokens),
  });
};
