import type { InputState } from 'gpui-base';
import { h_flex, InputState as InputStates } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle } from 'gpui-kit';
import { View } from 'gpui-kit';
import { openOverlay, props } from 'herdr';

import {
  closeOverlay,
  detailText,
  iconButton,
  modName,
  popupSurface,
  recordOf,
  searchField,
  spacing,
  stateLine,
  stringOf,
} from '../../kit/index.ts';
import { findScene, sceneOrigin } from './catalog.ts';
import type { SceneName } from './catalog.ts';
import { briefScene } from './directions/attention/brief.ts';
import { cornerScene } from './directions/attention/corner.ts';
import { createMixState, mixScene } from './directions/attention/mix.ts';
import { contentScene } from './directions/content/scene.ts';
import { dialogScene } from './directions/dialogs/scene.ts';
import { draftReviewScene } from './directions/draftReview/scene.ts';
import { koja, kojaNormal } from './directions/koja.ts';
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
import type { SceneInputs } from './scenes/inputs.ts';
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
import {
  paletteClean,
  paletteClearFail,
  paletteNearFail,
  paletteNearPass,
} from './scenes/smoke/palette.ts';
import { statesScene } from './scenes/states.ts';

const renderers: Record<SceneName, (inputs: SceneInputs) => Element> = {
  sidebar: sidebarScene,
  states: statesScene,
  popup: popupScene,
  controls: controlsScene,
  shell: shellScene,
  'pane-headers': paneHeadersScene,
  'smoke-1': (inputs) => paletteNearFail(inputs.command),
  'smoke-2': (inputs) => paletteClean(inputs.command),
  'smoke-3': (inputs) => paletteClearFail(inputs.command),
  'smoke-4': (inputs) => paletteNearPass(inputs.command),
  'attention-corner': () => cornerScene(koja),
  'attention-corner-normal': () => cornerScene(kojaNormal),
  'attention-mix': (inputs) => mixScene(false, koja, inputs.attention),
  'attention-mix-normal': (inputs) => mixScene(false, kojaNormal, inputs.attention),
  'attention-mix-open': (inputs) => mixScene(true, koja, inputs.attention),
  'attention-brief': () => briefScene(koja),
  'attention-brief-normal': () => briefScene(kojaNormal),
  'direction-koja': () => directionWindow(koja),
  'direction-koja-normal': () => directionWindow(kojaNormal),
  'sidebar-inbox': () => directionWindow(koja, inboxSidebar),
  'sidebar-hover': () => hoverScene(koja),
  'sidebar-find': () => searchScene(koja),
  'sidebar-states': () => machineTagScene(koja),
  'shell-attention': (inputs) => shellAttentionScene(false, koja, inputs.attention),
  'shell-attention-normal': (inputs) => shellAttentionScene(false, kojaNormal, inputs.attention),
  'shell-attention-open': (inputs) => shellAttentionScene(true, koja, inputs.attention),
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

// A refocus after the window has drawn, when its input or focus target can take the keyboard.
const refocusMilliseconds = 600;

const pickerHint = 'Type a scene name and press Enter.';

const sceneName = (): string | null => stringOf(recordOf(props())['scene']);

const createSceneInputs = (): SceneInputs => ({
  attention: createMixState(),
  search: InputStates.new({ value: popupQuery }),
  field: InputStates.new({ placeholder: 'Branch name…' }),
  filledField: InputStates.new({ value: 'feature/ui-foundation' }),
  command: InputStates.new({ placeholder: 'Type a command…' }),
});

export default class Mocks extends View {
  private error: string | null = null;

  private handle: FocusHandle | null = null;

  private readonly input: InputState = InputStates.new({ placeholder: 'Scene name…' });

  private sceneInputs: SceneInputs | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.handle = cx.focus_handle();

    if (sceneName() !== null) {
      this.sceneInputs = createSceneInputs();
    }

    this.input.on('change', (_event, changeCx) => {
      this.error = null;
      changeCx.notify();
    });

    this.input.on('submit', (_event, submitCx) => {
      this.openScene(submitCx);
    });

    this.focusSelf();

    cx.timer.after(refocusMilliseconds, () => {
      this.focusSelf();
    });
  }

  override render(): Element {
    const name = sceneName();

    return name === null ? this.picker() : this.scene(name);
  }

  private focusSelf(): void {
    if (sceneName() === null) {
      this.input.focus();
    } else {
      this.handle?.focus();
    }
  }

  private openScene(cx: Context): void {
    const lookup = findScene(this.input.value());

    if ('error' in lookup) {
      this.error = lookup.error;
      cx.notify();

      return;
    }

    openOverlay({
      mod: modName,
      props: { scene: lookup.scene.name },
      kind: 'window',
      frame: 'none',
      at: sceneOrigin,
      width: lookup.scene.width,
      height: lookup.scene.height,
    });

    closeOverlay();
  }

  private pickerLine(): Element {
    if (this.error !== null) {
      return stateLine({ kind: 'error', text: this.error });
    }

    return stateLine({ kind: 'empty', text: pickerHint });
  }

  private picker(): Element {
    return this.tracked(
      popupSurface('mocks-picker')
        .child(searchField(this.input, 'search'))
        .child(this.pickerLine()),
    );
  }

  private scene(name: string): Element {
    const content = this.sceneContent(name);

    const header = h_flex()
      .flex_none()
      .justify_between()
      .items_center()
      .px(spacing.large)
      .child(detailText(name))
      .child(
        iconButton({ name: 'x', size: 'small' })
          .accessibility_label('Close scene')
          .on_click((_event, clickCx) => {
            clickCx.stop_propagation();
            closeOverlay();
          }),
      );

    return this.tracked(
      popupSurface('mocks-scene')
        .h_full()
        .on_key_down((event, keyCx) => {
          if (event.key === 'escape') {
            keyCx.stop_propagation();
            closeOverlay();
          }
        })
        .child(header)
        .child(content),
    );
  }

  private sceneContent(name: string): Element {
    const lookup = findScene(name);

    if ('error' in lookup) {
      return stateLine({ kind: 'error', text: lookup.error });
    }

    if (this.sceneInputs === null) {
      return stateLine({ kind: 'error', text: 'The scene opened without its inputs.' });
    }

    return renderers[lookup.scene.name](this.sceneInputs);
  }

  private tracked(element: Element): Element {
    return this.handle === null ? element : element.track_focus(this.handle);
  }
}
