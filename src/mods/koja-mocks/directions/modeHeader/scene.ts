import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { FakePane } from '../../scenes/shellContent.ts';
import { agentPane, shellPane } from '../../scenes/shellContent.ts';
import { koja, kojaNormal } from '../koja.ts';
import { cardSlot, iconToggle } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { directionWindow } from '../window.ts';
import { reviewPane } from './data.ts';
import type { HeaderFit, HeaderLook, PaneFocus } from './pane.ts';
import { changesPanel, modePane } from './pane.ts';

// `pending` holds the count and prefix keys typed so far, and is empty when no key is pending.
type Keyboard = { mode: 'insert' } | { mode: 'normal'; pending: string[] };

type SplitPlace = 'upper' | 'lower' | 'beside';

// How far each pane's header has narrowed at its width in the scene.
type Layout =
  | { kind: 'shell'; agentFit: HeaderFit }
  | { kind: 'lone' }
  | { kind: 'split'; focused: SplitPlace; fits: Record<SplitPlace, HeaderFit> };

interface ModeScene {
  layout: Layout;
  keyboard: Keyboard;
}

const shell: Layout = { kind: 'shell', agentFit: 'folderShort' };
// Two keycaps take about 30 px more than the row has left beside the whole branch.
const pendingShell: Layout = { kind: 'shell', agentFit: 'branchCut' };

const modeScenes = {
  insert: { layout: shell, keyboard: { mode: 'insert' } },
  normal: { layout: shell, keyboard: { mode: 'normal', pending: [] } },
  pending: { layout: pendingShell, keyboard: { mode: 'normal', pending: ['3', 's'] } },
  split: {
    layout: {
      kind: 'split',
      focused: 'beside',
      fits: { upper: 'full', lower: 'full', beside: 'full' },
    },
    keyboard: { mode: 'insert' },
  },
  'split-normal': {
    layout: {
      kind: 'split',
      focused: 'upper',
      fits: { upper: 'taskDropped', lower: 'full', beside: 'full' },
    },
    keyboard: { mode: 'normal', pending: ['g'] },
  },
  lone: { layout: { kind: 'lone' }, keyboard: { mode: 'insert' } },
} satisfies Record<string, ModeScene>;

export type ModeSceneName = keyof typeof modeScenes;

const tokensOf = (keyboard: Keyboard): DirectionTokens =>
  keyboard.mode === 'normal' ? kojaNormal : koja;

const focusOf = (keyboard: Keyboard): PaneFocus => ({
  focused: true,
  pending: keyboard.mode === 'normal' ? keyboard.pending : [],
});

const unfocused: PaneFocus = { focused: false };

const wideSlot = (inner: Element, tokens: DirectionTokens): Element =>
  cardSlot(inner, tokens).flex_1();

const shellPanes = (agentFit: HeaderFit, scene: ModeScene, tokens: DirectionTokens): Element[] => {
  const agentLook: HeaderLook = { focus: focusOf(scene.keyboard), fit: agentFit };
  const shellLook: HeaderLook = { focus: unfocused, fit: 'full' };

  return [
    wideSlot(modePane(agentPane, agentLook, tokens), tokens),
    cardSlot(modePane(shellPane, shellLook, tokens), tokens)
      .w(tokens.areas.shellPaneWidth)
      .flex_none(),
    changesPanel(tokens),
  ];
};

const splitPanes = (
  layout: Extract<Layout, { kind: 'split' }>,
  scene: ModeScene,
  tokens: DirectionTokens,
): Element[] => {
  const placed = (place: SplitPlace, fakePane: FakePane): Element => {
    const focus = place === layout.focused ? focusOf(scene.keyboard) : unfocused;

    return modePane(fakePane, { focus, fit: layout.fits[place] }, tokens);
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

const panesOf = (scene: ModeScene, tokens: DirectionTokens): Element[] => {
  const { layout } = scene;

  if (layout.kind === 'shell') {
    return shellPanes(layout.agentFit, scene, tokens);
  }

  if (layout.kind === 'split') {
    return splitPanes(layout, scene, tokens);
  }

  const look: HeaderLook = { focus: focusOf(scene.keyboard), fit: 'full' };

  return [wideSlot(modePane(agentPane, look, tokens), tokens)];
};

export const modeScene = (name: ModeSceneName): Element => {
  const scene: ModeScene = modeScenes[name];
  const panelOpen = scene.layout.kind === 'shell';

  return directionWindow(tokensOf(scene.keyboard), undefined, {
    agent: null,
    modeMark: 'paneChrome',
    toggles: (tokens) => [
      iconToggle('git-compare', panelOpen, tokens),
      iconToggle('folder', false, tokens),
    ],
    panes: (tokens) => panesOf(scene, tokens),
  });
};
