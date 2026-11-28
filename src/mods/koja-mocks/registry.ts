import type { InputState } from 'gpui-base';
import { InputState as InputStates } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { SceneName } from './catalog.ts';
import { briefScene } from './directions/attention/brief.ts';
import { cornerScene } from './directions/attention/corner.ts';
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

// Runs once in the view's init. Herdr makes input states only outside render.
export type SceneSetup = () => OpenScene;

const plainScene =
  (draw: () => Element): SceneSetup =>
  () => ({ draw, field: null });

const stateScene =
  <State>(create: () => State, draw: (state: State) => Element): SceneSetup =>
  () => {
    const state = create();

    return { draw: () => draw(state), field: null };
  };

const fieldScene = <Fields extends Record<string, InputState>>(spec: {
  fields: () => Fields;
  draw: (fields: Fields) => Element;
  focus: Extract<keyof Fields, string>;
}): SceneSetup => {
  return () => {
    const fields = spec.fields();
    const field: Fields[Extract<keyof Fields, string>] = fields[spec.focus];

    return { draw: () => spec.draw(fields), field };
  };
};

const commandScene = (draw: (command: InputState) => Element): SceneSetup =>
  fieldScene({
    fields: () => ({ command: InputStates.new({ placeholder: 'Type a command…' }) }),
    draw: ({ command }) => draw(command),
    focus: 'command',
  });

export const sceneSetups: Record<SceneName, SceneSetup> = {
  sidebar: plainScene(sidebarScene),
  states: plainScene(statesScene),
  popup: fieldScene({
    fields: () => ({ search: InputStates.new({ value: popupQuery }) }),
    draw: ({ search }) => popupScene(search),
    focus: 'search',
  }),
  controls: fieldScene({
    fields: () => ({
      empty: InputStates.new({ placeholder: 'Branch name…' }),
      filled: InputStates.new({ value: 'feature/ui-foundation' }),
    }),
    draw: controlsScene,
    focus: 'filled',
  }),
  shell: plainScene(shellScene),
  'pane-headers': plainScene(paneHeadersScene),
  'pane-headers-roles': plainScene(paneHeadersRolesScene),
  'sidebar-parts': plainScene(sidebarPartsScene),
  'header-mark-name': plainScene(() => headerMarksScene('name', 'flat', 'none')),
  'header-mark-right': plainScene(() => headerMarksScene('right', 'flat', 'none')),
  'header-mark-right-active': plainScene(() => headerMarksScene('rightActive', 'flat', 'none')),
  'header-mark-left-active': plainScene(() => headerMarksScene('leftActive', 'nested', 'none')),
  'header-mark-after-name': plainScene(() => headerMarksScene('afterName', 'nested', 'none')),
  'header-mark-left-flat': plainScene(() => headerMarksScene('leftActive', 'flat', 'none')),
  'header-mark-after-name-flat': plainScene(() => headerMarksScene('afterName', 'flat', 'none')),
  'header-mark-left-divider': plainScene(() => headerMarksScene('leftActive', 'flat', 'full')),
  'header-mark-left-divider-inset': plainScene(() =>
    headerMarksScene('leftActive', 'flat', 'inset'),
  ),
  'header-mark-left-divider-soft': plainScene(() => headerMarksScene('leftActive', 'flat', 'soft')),
  'smoke-1': commandScene(paletteNearFail),
  'smoke-2': commandScene(paletteClean),
  'smoke-3': commandScene(paletteClearFail),
  'smoke-4': commandScene(paletteNearPass),
  'attention-corner': plainScene(() => cornerScene(koja)),
  'attention-corner-normal': plainScene(() => cornerScene(kojaNormal)),
  'attention-mix': stateScene(createMixState, (attention) => mixScene(false, koja, attention)),
  'attention-mix-normal': stateScene(createMixState, (attention) =>
    mixScene(false, kojaNormal, attention),
  ),
  'attention-mix-open': stateScene(createMixState, (attention) => mixScene(true, koja, attention)),
  'attention-brief': plainScene(() => briefScene(koja)),
  'attention-brief-normal': plainScene(() => briefScene(kojaNormal)),
  'direction-koja': plainScene(() => directionWindow(koja)),
  'direction-koja-normal': plainScene(() => directionWindow(kojaNormal)),
  'header-mode-insert': plainScene(() => modeScene('insert')),
  'header-mode-normal': plainScene(() => modeScene('normal')),
  'header-mode-pending': plainScene(() => modeScene('pending')),
  'header-mode-split': plainScene(() => modeScene('split')),
  'header-mode-split-normal': plainScene(() => modeScene('split-normal')),
  'header-mode-lone': plainScene(() => modeScene('lone')),
  'sidebar-inbox': plainScene(() => directionWindow(koja, inboxSidebar)),
  'sidebar-hover': plainScene(() => hoverScene(koja)),
  'sidebar-find': plainScene(() => searchScene(koja)),
  'sidebar-states': plainScene(() => machineTagScene(koja)),
  'shell-attention': stateScene(createMixState, (attention) =>
    shellAttentionScene(false, koja, attention),
  ),
  'shell-attention-normal': stateScene(createMixState, (attention) =>
    shellAttentionScene(false, kojaNormal, attention),
  ),
  'shell-attention-open': stateScene(createMixState, (attention) =>
    shellAttentionScene(true, koja, attention),
  ),
  'shell-dialog': plainScene(shellDialogScene),
  'shell-content': plainScene(shellContentScene),
  'shell-pr-view': plainScene(shellPullRequestScene),
  'shell-draft-review': plainScene(shellDraftReviewScene),
  'shell-ticket': plainScene(shellTicketScene),
  'dialog-close': plainScene(() => dialogScene('close', koja)),
  'dialog-close-normal': plainScene(() => dialogScene('close', kojaNormal)),
  'dialog-rename': plainScene(() => dialogScene('rename', koja)),
  'dialog-rename-normal': plainScene(() => dialogScene('rename', kojaNormal)),
  'dialog-wt-new': plainScene(() => dialogScene('wt-new', koja)),
  'dialog-wt-open': plainScene(() => dialogScene('wt-open', koja)),
  'dialog-wt-remove': plainScene(() => dialogScene('wt-remove', koja)),
  'overlay-palette': plainScene(() => paletteScene(kojaNormal)),
  'overlay-goto': plainScene(() => gotoScene(kojaNormal)),
  'overlay-keys': plainScene(() => keysScene(kojaNormal)),
  'overlay-menu': plainScene(() => menuScene(koja)),
  'overlay-new': plainScene(() => newScene(koja)),
  'overlay-menu-normal': plainScene(() => menuScene(kojaNormal)),
  'overlay-new-normal': plainScene(() => newScene(kojaNormal)),
  'panels-tabs-stack': plainScene(() => tabsScene('Stack', koja)),
  'panels-tabs-changes': plainScene(() => tabsScene('Changes', koja)),
  'panels-tabs-workers': plainScene(() => tabsScene('Workers', koja)),
  'panels-tabs-files': plainScene(() => tabsScene('Files', koja)),
  'panels-sections': plainScene(() => sectionsScene(koja)),
  'panels-spine': plainScene(() => spineScene(false, koja)),
  'panels-spine-files': plainScene(() => spineScene(true, koja)),
  'panels-docks': plainScene(() => docksScene(koja)),
  'spine-inline': plainScene(() => spineTakeScene('inline', koja)),
  'spine-rail': plainScene(() => spineTakeScene('rail', koja)),
  'spine-pinned': plainScene(() => spineTakeScene('pinned', koja)),
  'rail-busy': plainScene(() => railScene(railStates.busy, koja)),
  'rail-clean': plainScene(() => railScene(railStates.clean, koja)),
  'rail-single': plainScene(() => railScene(railStates.single, koja)),
  'rail-no-pr': plainScene(() => railScene(railStates.noPull, koja)),
  'rail-main': plainScene(() => railScene(railStates.main, koja)),
  'rail-error': plainScene(() => railScene(railStates.error, koja)),
  'rail-normal': plainScene(() => railScene(railStates.base, kojaNormal)),
  'split-two-base': plainScene(() => splitScene('two', railStates.base, koja)),
  'split-two-busy': plainScene(() => splitScene('two', railStates.busy, koja)),
  'split-two-main': plainScene(() => splitScene('two', railStates.main, koja)),
  'split-three-base': plainScene(() => splitScene('three', railStates.base, koja)),
  'split-three-busy': plainScene(() => splitScene('three', railStates.busy, koja)),
  'split-three-main': plainScene(() => splitScene('three', railStates.main, koja)),
  'space-base': plainScene(() => spaceScene(spaceStates.base, koja)),
  'space-busy': plainScene(() => spaceScene(spaceStates.busy, koja)),
  'space-clean': plainScene(() => spaceScene(spaceStates.clean, koja)),
  'space-single': plainScene(() => spaceScene(spaceStates.single, koja)),
  'space-no-pr': plainScene(() => spaceScene(spaceStates.noPull, koja)),
  'space-main': plainScene(() => spaceScene(spaceStates.main, koja)),
  'space-error': plainScene(() => spaceScene(spaceStates.error, koja)),
  'space-normal': plainScene(() => spaceScene(spaceStates.base, kojaNormal)),
  'draft-review-comment': plainScene(() => draftReviewScene('comment')),
  'draft-review-range': plainScene(() => draftReviewScene('range')),
  'draft-review-file-comment': plainScene(() => draftReviewScene('file-comment')),
  'draft-review-edit-line': plainScene(() => draftReviewScene('edit-line')),
  'draft-review-edit-file': plainScene(() => draftReviewScene('edit-file')),
  'draft-review-saving-failed': plainScene(() => draftReviewScene('saving-failed')),
  'draft-review-changed-on-disk': plainScene(() => draftReviewScene('changed-on-disk')),
  'draft-review-sent': plainScene(() => draftReviewScene('sent')),
  'draft-review-broken': plainScene(() => draftReviewScene('broken')),
  'draft-review-plan': plainScene(() => draftReviewScene('plan')),
  'draft-review-normal': plainScene(() => draftReviewScene('normal')),
  'ticket-view-container': plainScene(() => ticketScene('container')),
  'ticket-view-single': plainScene(() => ticketScene('single')),
  'ticket-view-loading': plainScene(() => ticketScene('loading')),
  'ticket-view-unreachable': plainScene(() => ticketScene('unreachable')),
  'ticket-view-sync-failed': plainScene(() => ticketScene('sync-failed')),
  'ticket-view-nothing-ready': plainScene(() => ticketScene('nothing-ready')),
  'ticket-view-done': plainScene(() => ticketScene('done')),
  'ticket-view-plain': plainScene(() => ticketScene('plain')),
  'ticket-view-tikk': plainScene(() => ticketScene('tikk')),
  'ticket-view-long': plainScene(() => ticketScene('long')),
  'ticket-view-normal': plainScene(() => ticketScene('normal')),
  'ticket-view-wide': plainScene(() => ticketScene('wide')),
  'content-rail-review': plainScene(() => contentScene('review')),
  'content-rail-pr': plainScene(() => contentScene('pr')),
  'content-rail-ticket': plainScene(() => contentScene('ticket')),
  'content-rail-review-saving-failed': plainScene(() => contentScene('review-saving-failed')),
  'content-rail-review-sent': plainScene(() => contentScene('review-sent')),
  'content-rail-review-narrow': plainScene(() => contentScene('review-narrow')),
  'content-rail-pr-checks-failed': plainScene(() => contentScene('pr-checks-failed')),
  'content-rail-pr-unreachable': plainScene(() => contentScene('pr-unreachable')),
  'content-rail-ticket-loading': plainScene(() => contentScene('ticket-loading')),
  'content-rail-ticket-long': plainScene(() => contentScene('ticket-long')),
  'content-rail-pr-normal': plainScene(() => contentScene('pr-normal')),
  'pr-tray-bar': plainScene(() => pullRequestScene('tray-bar')),
  'pr-tray-header': plainScene(() => pullRequestScene('tray-header')),
  'pr-tray-section': plainScene(() => pullRequestScene('tray-section')),
  'pr-view-blocked': plainScene(() => pullRequestScene('blocked')),
  'pr-view-sent': plainScene(() => pullRequestScene('sent')),
  'pr-view-ready': plainScene(() => pullRequestScene('ready')),
  'pr-view-ready-menu': plainScene(() => pullRequestScene('ready-menu')),
  'pr-view-merge-confirm': plainScene(() => pullRequestScene('merge-confirm')),
  'pr-view-merge-failed': plainScene(() => pullRequestScene('merge-failed')),
  'pr-view-checks-failed': plainScene(() => pullRequestScene('checks-failed')),
  'pr-view-unreachable': plainScene(() => pullRequestScene('unreachable')),
  'pr-view-normal': plainScene(() => pullRequestScene('normal')),
  'pr-view-zoomed': plainScene(() => pullRequestScene('zoomed')),
};
