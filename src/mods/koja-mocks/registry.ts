import type { InputState } from 'gpui-base';
import { InputState as InputStates } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { SceneName } from './catalog.ts';
import { briefScene } from './directions/attention/brief.ts';
import { cornerScene } from './directions/attention/corner.ts';
import type { MixState } from './directions/attention/mix.ts';
import { createMixState, mixScene } from './directions/attention/mix.ts';
import { contentScene } from './directions/content/scene.ts';
import { dialogScene } from './directions/dialogs/scene.ts';
import { draftReviewScene } from './directions/draftReview/scene.ts';
import { koja, kojaNormal } from './directions/koja.ts';
import { modeScene } from './directions/modeHeader/scene.ts';
import { gotoScene } from './directions/overlays/goto.ts';
import { keysScene } from './directions/overlays/keys.ts';
import { menuScene, newScene } from './directions/overlays/menus.ts';
import { paletteScene } from './directions/overlays/palette.ts';
import {
  docksScene,
  sectionsScene,
  spineScene,
  tabsScene,
} from './directions/panels/arrangements.ts';
import { railScene } from './directions/panels/rail.ts';
import { railStates } from './directions/panels/railData.ts';
import { spaceScene } from './directions/panels/space.ts';
import { spaceStates } from './directions/panels/spaceData.ts';
import { spineTakeScene } from './directions/panels/spine.ts';
import { splitScene } from './directions/panels/split.ts';
import { pullRequestScene } from './directions/pullRequest/scene.ts';
import { hoverScene, searchScene } from './directions/sidebars/find.ts';
import { inboxSidebar } from './directions/sidebars/sidebar.ts';
import { machineTagScene } from './directions/sidebars/states.ts';
import { ticketScene } from './directions/ticket/scene.ts';
import { directionWindow } from './directions/window.ts';
import { controlsScene } from './scenes/controls.ts';
import { headerMarksScene } from './scenes/headerMarks.ts';
import { paneHeadersRolesScene } from './scenes/paneHeaderRoles.ts';
import { paneHeadersScene } from './scenes/paneHeaders.ts';
import { popupQuery, popupScene } from './scenes/popup.ts';
import {
  shellAttentionScene,
  shellContentScene,
  shellDialogScene,
  shellDraftReviewScene,
  shellPullRequestScene,
  shellScene,
  shellTicketScene,
} from './scenes/shell.ts';
import { sidebarScene } from './scenes/sidebar.ts';
import { sidebarPartsScene } from './scenes/sidebarParts.ts';
import {
  paletteClean,
  paletteClearFail,
  paletteNearFail,
  paletteNearPass,
} from './scenes/smoke/palette.ts';
import { statesScene } from './scenes/states.ts';

export interface OpenScene {
  draw: () => Element;
  field: InputState | null;
}

// `open` runs once in the view's init. Herdr makes input states only outside render.
type SceneEntry = (() => Element) | { open: () => OpenScene };

const commandScene = (draw: (command: InputState) => Element): SceneEntry => ({
  open: () => {
    const command = InputStates.new({ placeholder: 'Type a command…' });

    return { draw: () => draw(command), field: command };
  },
});

const attentionScene = (draw: (state: MixState) => Element): SceneEntry => ({
  open: () => {
    const state = createMixState();

    return { draw: () => draw(state), field: null };
  },
});

const sceneEntries: Record<SceneName, SceneEntry> = {
  sidebar: sidebarScene,
  states: statesScene,
  popup: {
    open: () => {
      const search = InputStates.new({ value: popupQuery });

      return { draw: () => popupScene(search), field: search };
    },
  },
  controls: {
    open: () => {
      const empty = InputStates.new({ placeholder: 'Branch name…' });
      const filled = InputStates.new({ value: 'feature/ui-foundation' });

      return { draw: () => controlsScene({ empty, filled }), field: filled };
    },
  },
  shell: shellScene,
  'pane-headers': paneHeadersScene,
  'pane-headers-roles': paneHeadersRolesScene,
  'sidebar-parts': sidebarPartsScene,
  'header-mark-name': () => headerMarksScene('name', 'flat', 'none'),
  'header-mark-right': () => headerMarksScene('right', 'flat', 'none'),
  'header-mark-right-active': () => headerMarksScene('rightActive', 'flat', 'none'),
  'header-mark-left-active': () => headerMarksScene('leftActive', 'nested', 'none'),
  'header-mark-after-name': () => headerMarksScene('afterName', 'nested', 'none'),
  'header-mark-left-flat': () => headerMarksScene('leftActive', 'flat', 'none'),
  'header-mark-after-name-flat': () => headerMarksScene('afterName', 'flat', 'none'),
  'header-mark-left-divider': () => headerMarksScene('leftActive', 'flat', 'full'),
  'header-mark-left-divider-inset': () => headerMarksScene('leftActive', 'flat', 'inset'),
  'header-mark-left-divider-soft': () => headerMarksScene('leftActive', 'flat', 'soft'),
  'smoke-1': commandScene(paletteNearFail),
  'smoke-2': commandScene(paletteClean),
  'smoke-3': commandScene(paletteClearFail),
  'smoke-4': commandScene(paletteNearPass),
  'attention-corner': () => cornerScene(koja),
  'attention-corner-normal': () => cornerScene(kojaNormal),
  'attention-mix': attentionScene((attention) => mixScene(false, koja, attention)),
  'attention-mix-normal': attentionScene((attention) => mixScene(false, kojaNormal, attention)),
  'attention-mix-open': attentionScene((attention) => mixScene(true, koja, attention)),
  'attention-brief': () => briefScene(koja),
  'attention-brief-normal': () => briefScene(kojaNormal),
  'direction-koja': () => directionWindow(koja),
  'direction-koja-normal': () => directionWindow(kojaNormal),
  'header-mode-insert': () => modeScene('insert'),
  'header-mode-normal': () => modeScene('normal'),
  'header-mode-pending': () => modeScene('pending'),
  'header-mode-split': () => modeScene('split'),
  'header-mode-split-normal': () => modeScene('split-normal'),
  'header-mode-lone': () => modeScene('lone'),
  'sidebar-inbox': () => directionWindow(koja, inboxSidebar),
  'sidebar-hover': () => hoverScene(koja),
  'sidebar-find': () => searchScene(koja),
  'sidebar-states': () => machineTagScene(koja),
  'shell-attention': attentionScene((attention) => shellAttentionScene(false, koja, attention)),
  'shell-attention-normal': attentionScene((attention) =>
    shellAttentionScene(false, kojaNormal, attention),
  ),
  'shell-attention-open': attentionScene((attention) => shellAttentionScene(true, koja, attention)),
  'shell-dialog': shellDialogScene,
  'shell-content': shellContentScene,
  'shell-pr-view': shellPullRequestScene,
  'shell-draft-review': shellDraftReviewScene,
  'shell-ticket': shellTicketScene,
  'dialog-close': () => dialogScene('close', koja),
  'dialog-close-normal': () => dialogScene('close', kojaNormal),
  'dialog-rename': () => dialogScene('rename', koja),
  'dialog-rename-normal': () => dialogScene('rename', kojaNormal),
  'dialog-wt-new': () => dialogScene('wt-new', koja),
  'dialog-wt-open': () => dialogScene('wt-open', koja),
  'dialog-wt-remove': () => dialogScene('wt-remove', koja),
  'overlay-palette': () => paletteScene(kojaNormal),
  'overlay-goto': () => gotoScene(kojaNormal),
  'overlay-keys': () => keysScene(kojaNormal),
  'overlay-menu': () => menuScene(koja),
  'overlay-new': () => newScene(koja),
  'overlay-menu-normal': () => menuScene(kojaNormal),
  'overlay-new-normal': () => newScene(kojaNormal),
  'panels-tabs-stack': () => tabsScene('Stack', koja),
  'panels-tabs-changes': () => tabsScene('Changes', koja),
  'panels-tabs-workers': () => tabsScene('Workers', koja),
  'panels-tabs-files': () => tabsScene('Files', koja),
  'panels-sections': () => sectionsScene(koja),
  'panels-spine': () => spineScene(false, koja),
  'panels-spine-files': () => spineScene(true, koja),
  'panels-docks': () => docksScene(koja),
  'spine-inline': () => spineTakeScene('inline', koja),
  'spine-rail': () => spineTakeScene('rail', koja),
  'spine-pinned': () => spineTakeScene('pinned', koja),
  'rail-busy': () => railScene(railStates.busy, koja),
  'rail-clean': () => railScene(railStates.clean, koja),
  'rail-single': () => railScene(railStates.single, koja),
  'rail-no-pr': () => railScene(railStates.noPull, koja),
  'rail-main': () => railScene(railStates.main, koja),
  'rail-error': () => railScene(railStates.error, koja),
  'rail-normal': () => railScene(railStates.base, kojaNormal),
  'split-two-base': () => splitScene('two', railStates.base, koja),
  'split-two-busy': () => splitScene('two', railStates.busy, koja),
  'split-two-main': () => splitScene('two', railStates.main, koja),
  'split-three-base': () => splitScene('three', railStates.base, koja),
  'split-three-busy': () => splitScene('three', railStates.busy, koja),
  'split-three-main': () => splitScene('three', railStates.main, koja),
  'space-base': () => spaceScene(spaceStates.base, koja),
  'space-busy': () => spaceScene(spaceStates.busy, koja),
  'space-clean': () => spaceScene(spaceStates.clean, koja),
  'space-single': () => spaceScene(spaceStates.single, koja),
  'space-no-pr': () => spaceScene(spaceStates.noPull, koja),
  'space-main': () => spaceScene(spaceStates.main, koja),
  'space-error': () => spaceScene(spaceStates.error, koja),
  'space-normal': () => spaceScene(spaceStates.base, kojaNormal),
  'draft-review-comment': () => draftReviewScene('comment'),
  'draft-review-range': () => draftReviewScene('range'),
  'draft-review-file-comment': () => draftReviewScene('file-comment'),
  'draft-review-edit-line': () => draftReviewScene('edit-line'),
  'draft-review-edit-file': () => draftReviewScene('edit-file'),
  'draft-review-saving-failed': () => draftReviewScene('saving-failed'),
  'draft-review-changed-on-disk': () => draftReviewScene('changed-on-disk'),
  'draft-review-sent': () => draftReviewScene('sent'),
  'draft-review-broken': () => draftReviewScene('broken'),
  'draft-review-plan': () => draftReviewScene('plan'),
  'draft-review-normal': () => draftReviewScene('normal'),
  'ticket-view-container': () => ticketScene('container'),
  'ticket-view-single': () => ticketScene('single'),
  'ticket-view-loading': () => ticketScene('loading'),
  'ticket-view-unreachable': () => ticketScene('unreachable'),
  'ticket-view-sync-failed': () => ticketScene('sync-failed'),
  'ticket-view-nothing-ready': () => ticketScene('nothing-ready'),
  'ticket-view-done': () => ticketScene('done'),
  'ticket-view-plain': () => ticketScene('plain'),
  'ticket-view-tikk': () => ticketScene('tikk'),
  'ticket-view-long': () => ticketScene('long'),
  'ticket-view-normal': () => ticketScene('normal'),
  'ticket-view-wide': () => ticketScene('wide'),
  'content-rail-review': () => contentScene('review'),
  'content-rail-pr': () => contentScene('pr'),
  'content-rail-ticket': () => contentScene('ticket'),
  'content-rail-review-saving-failed': () => contentScene('review-saving-failed'),
  'content-rail-review-sent': () => contentScene('review-sent'),
  'content-rail-review-narrow': () => contentScene('review-narrow'),
  'content-rail-pr-checks-failed': () => contentScene('pr-checks-failed'),
  'content-rail-pr-unreachable': () => contentScene('pr-unreachable'),
  'content-rail-ticket-loading': () => contentScene('ticket-loading'),
  'content-rail-ticket-long': () => contentScene('ticket-long'),
  'content-rail-pr-normal': () => contentScene('pr-normal'),
  'pr-tray-bar': () => pullRequestScene('tray-bar'),
  'pr-tray-header': () => pullRequestScene('tray-header'),
  'pr-tray-section': () => pullRequestScene('tray-section'),
  'pr-view-blocked': () => pullRequestScene('blocked'),
  'pr-view-sent': () => pullRequestScene('sent'),
  'pr-view-ready': () => pullRequestScene('ready'),
  'pr-view-ready-menu': () => pullRequestScene('ready-menu'),
  'pr-view-merge-confirm': () => pullRequestScene('merge-confirm'),
  'pr-view-merge-failed': () => pullRequestScene('merge-failed'),
  'pr-view-checks-failed': () => pullRequestScene('checks-failed'),
  'pr-view-unreachable': () => pullRequestScene('unreachable'),
  'pr-view-normal': () => pullRequestScene('normal'),
  'pr-view-zoomed': () => pullRequestScene('zoomed'),
};

export const openRegisteredScene = (name: SceneName): OpenScene => {
  const entry = sceneEntries[name];

  return typeof entry === 'function' ? { draw: entry, field: null } : entry.open();
};
