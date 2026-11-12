import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { FakePane } from '../../scenes/shellContent.ts';
import { agentPane, shellPane } from '../../scenes/shellContent.ts';
import { koja, kojaNormal } from '../koja.ts';
import { cardSlot, iconToggle } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { directionWindow } from '../window.ts';
import { reviewPane } from './data.ts';
import type { PaneFocus, RowFit, RowLook, RowPosition } from './pane.ts';
import { changesPanel, chromePane } from './pane.ts';

// `pending` holds the count and prefix typed so far, and is empty when no key is pending.
type Keyboard = { mode: 'insert' } | { mode: 'normal'; pending: string };

type SplitPlace = 'upper' | 'lower' | 'beside';

// How far each pane's chrome row has narrowed at its width in the scene.
type Layout =
  | { kind: 'shell'; agentFit: RowFit }
  | { kind: 'lone' }
  | { kind: 'split'; focused: SplitPlace; fits: Record<SplitPlace, RowFit> };

interface ModeScene {
  layout: Layout;
  keyboard: Keyboard;
}

const shell: Layout = { kind: 'shell', agentFit: 'taskDropped' };
// The key-cap takes the width the cut branch needs, so the folder drops.
const pendingShell: Layout = { kind: 'shell', agentFit: 'folderDropped' };

const modeScenes = {
  insert: { layout: shell, keyboard: { mode: 'insert' } },
  normal: { layout: shell, keyboard: { mode: 'normal', pending: '' } },
  pending: { layout: pendingShell, keyboard: { mode: 'normal', pending: '3s' } },
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
    keyboard: { mode: 'normal', pending: 'g' },
  },
  lone: { layout: { kind: 'lone' }, keyboard: { mode: 'insert' } },
} satisfies Record<string, ModeScene>;

export type ModeSceneName = keyof typeof modeScenes;

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
  agentFit: RowFit,
  scene: ModeScene,
  position: RowPosition,
  tokens: DirectionTokens,
): Element[] => {
  const agentLook: RowLook = { focus: focusOf(scene.keyboard), fit: agentFit, position };
  const shellLook: RowLook = { focus: unfocused, fit: 'full', position };

  return [
    wideSlot(chromePane(agentPane, agentLook, tokens), tokens),
    cardSlot(chromePane(shellPane, shellLook, tokens), tokens)
      .w(tokens.areas.shellPaneWidth)
      .flex_none(),
    changesPanel(position, tokens),
  ];
};

const splitPanes = (
  layout: Extract<Layout, { kind: 'split' }>,
  scene: ModeScene,
  position: RowPosition,
  tokens: DirectionTokens,
): Element[] => {
  const placed = (place: SplitPlace, fakePane: FakePane): Element => {
    const focus = place === layout.focused ? focusOf(scene.keyboard) : unfocused;

    return chromePane(fakePane, { focus, fit: layout.fits[place], position }, tokens);
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

const panesOf = (scene: ModeScene, position: RowPosition, tokens: DirectionTokens): Element[] => {
  const { layout } = scene;

  if (layout.kind === 'shell') {
    return shellPanes(layout.agentFit, scene, position, tokens);
  }

  if (layout.kind === 'split') {
    return splitPanes(layout, scene, position, tokens);
  }

  const look: RowLook = { focus: focusOf(scene.keyboard), fit: 'full', position };

  return [wideSlot(chromePane(agentPane, look, tokens), tokens)];
};

// One scene at either position: the chrome row of every pane, and the Changes title row.
export const modeScene = (name: ModeSceneName, position: RowPosition): Element => {
  const scene: ModeScene = modeScenes[name];
  const panelOpen = scene.layout.kind === 'shell';

  return directionWindow(tokensOf(scene.keyboard), undefined, {
    agent: null,
    modeMark: 'paneChrome',
    toggles: (tokens) => [
      iconToggle('git-compare', panelOpen, tokens),
      iconToggle('folder', false, tokens),
    ],
    panes: (tokens) => panesOf(scene, position, tokens),
  });
};
