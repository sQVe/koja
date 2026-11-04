import type { InputState } from 'gpui-base';
import { h_flex, InputState as InputStates } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle } from 'gpui-kit';
import { View } from 'gpui-kit';
import { openOverlay, props } from 'herdr';

import {
  closeOverlay,
  detailText,
  emptyState,
  iconButton,
  modName,
  popupSurface,
  recordOf,
  searchField,
  spacing,
  stringOf,
} from '../../kit/index.ts';
import { findScene, sceneOrigin } from './catalog.ts';
import type { SceneName } from './catalog.ts';
import { controlsScene } from './scenes/controls.ts';
import type { SceneInputs } from './scenes/inputs.ts';
import { popupQuery, popupScene } from './scenes/popup.ts';
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
  'smoke-1': (inputs) => paletteNearFail(inputs.command),
  'smoke-2': (inputs) => paletteClean(inputs.command),
  'smoke-3': (inputs) => paletteClearFail(inputs.command),
  'smoke-4': (inputs) => paletteNearPass(inputs.command),
};

// A refocus after the window has drawn, when its input or focus target can take the keyboard.
const refocusMilliseconds = 600;

const pickerHint = 'Type a scene name and press Enter.';

const sceneName = (): string | null => stringOf(recordOf(props())['scene']);

const createSceneInputs = (): SceneInputs => ({
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

  private picker(): Element {
    return this.tracked(
      popupSurface('mocks-picker')
        .child(searchField(this.input, 'search'))
        .child(emptyState(this.error ?? pickerHint)),
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
        iconButton({ name: 'x', size: 'small' }).on_click((_event, clickCx) => {
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
      return emptyState(lookup.error);
    }

    if (this.sceneInputs === null) {
      return emptyState('The scene opened without its inputs.');
    }

    return renderers[lookup.scene.name](this.sceneInputs);
  }

  private tracked(element: Element): Element {
    return this.handle === null ? element : element.track_focus(this.handle);
  }
}
