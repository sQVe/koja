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
import { findScene, sceneOrigin, sceneReadyLine } from './catalog.ts';
import type { SceneName } from './catalog.ts';
import type { OpenScene } from './registry.ts';
import { openRegisteredScene } from './registry.ts';

interface ErrorWindow {
  kind: 'error';
  title: string;
  message: string;
}

interface ReadyWindow {
  kind: 'ready';
  name: SceneName;
  scene: OpenScene;
}

type SceneWindow = { kind: 'picker' } | ErrorWindow | ReadyWindow;

interface ShownWindow {
  requested: string | null;
  window: SceneWindow;
}

// A refocus after the window has drawn, when its input or focus target can take the keyboard.
const refocusMilliseconds = 600;

const pickerHint = 'Type a scene name and press Enter.';

const missingInputsMessage = 'The scene opened without its inputs.';

const sceneName = (): string | null => stringOf(recordOf(props())['scene']);

const errorLine = (message: string): Element => stateLine({ kind: 'error', text: message });

const resolveWindow = (
  requested: string | null,
  openScene: (name: SceneName) => OpenScene | null,
): SceneWindow => {
  if (requested === null) {
    return { kind: 'picker' };
  }

  const lookup = findScene(requested);

  if (!('scene' in lookup)) {
    return { kind: 'error', title: requested, message: lookup.error };
  }

  const scene = openScene(lookup.scene.name);

  if (scene === null) {
    return { kind: 'error', title: requested, message: missingInputsMessage };
  }

  return { kind: 'ready', name: lookup.scene.name, scene };
};

export default class Mocks extends View {
  private error: string | null = null;

  private handle: FocusHandle | null = null;

  private readonly input: InputState = InputStates.new({ placeholder: 'Scene name…' });

  private firstFrameDone = false;

  private shown: ShownWindow | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    const requested = sceneName();

    this.handle = cx.focus_handle();
    this.shown = { requested, window: resolveWindow(requested, openRegisteredScene) };

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
    const window = this.currentWindow();

    if (window.kind === 'picker') {
      return this.picker();
    }

    return this.sceneWindow(window);
  }

  private currentWindow(): SceneWindow {
    const requested = sceneName();
    const shown = this.shown;

    if (requested === shown?.requested) {
      return shown.window;
    }

    return resolveWindow(requested, (name) => this.retainedScene(name));
  }

  private retainedScene(name: SceneName): OpenScene | null {
    const window = this.shown?.window;

    if (window?.kind === 'ready' && window.name === name) {
      return window.scene;
    }

    return null;
  }

  private focusTarget(window: SceneWindow): { focus: () => void } | null {
    if (window.kind === 'picker') {
      return this.input;
    }

    if (window.kind === 'ready' && window.scene.field !== null) {
      return window.scene.field;
    }

    return this.handle;
  }

  private focusWindow(window: SceneWindow): void {
    this.focusTarget(window)?.focus();
  }

  private focusSelf(): void {
    this.focusWindow(this.currentWindow());
  }

  private openScene(cx: Context): void {
    const lookup = findScene(this.input.value());

    if (!('scene' in lookup)) {
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
      return errorLine(this.error);
    }

    return stateLine({ kind: 'empty', text: pickerHint });
  }

  private picker(): Element {
    const surface = popupSurface('mocks-picker')
      .child(searchField(this.input, 'search'))
      .child(this.pickerLine());

    return this.tracked(surface);
  }

  private sceneWindow(window: ErrorWindow | ReadyWindow): Element {
    const title = window.kind === 'ready' ? window.name : window.title;
    const content = window.kind === 'ready' ? window.scene.draw() : errorLine(window.message);

    const closeButton = iconButton({ name: 'x', size: 'small' })
      .accessibility_label('Close scene')
      .on_click((_event, clickCx) => {
        clickCx.stop_propagation();
        closeOverlay();
      });

    const header = h_flex()
      .flex_none()
      .justify_between()
      .items_center()
      .px(spacing.large)
      .child(detailText(title))
      .child(closeButton);

    const surface = popupSurface('mocks-scene')
      .h_full()
      .on_size_change((_size, layoutCx) => {
        if (window.kind !== 'ready' || this.firstFrameDone) {
          return;
        }

        this.firstFrameDone = true;
        this.focusWindow(window);
        this.announceReady(window.name, layoutCx);
      })
      .on_key_down((event, keyCx) => {
        if (event.key === 'escape') {
          keyCx.stop_propagation();
          closeOverlay();
        }
      })
      .child(header)
      .child(content);

    return this.tracked(surface);
  }

  private announceReady(name: SceneName, cx: Context): void {
    // Layout runs in the frame that draws the scene, so the frame after it is the first one
    // that shows the scene. A capture that waits for the line then shoots a drawn scene.
    cx.timer.after(0, () => {
      // eslint-disable-next-line no-console -- Herdr's mod log is console.log.
      console.log(sceneReadyLine(name));
    });
  }

  private tracked(element: Element): Element {
    return this.handle === null ? element : element.track_focus(this.handle);
  }
}
