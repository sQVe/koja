import type { AsyncContext, Context, Element, FocusHandle, KeyEvent } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import { exec, focused, nextCommand, panes, run, setShared, shared, spaces } from 'herdr';

import { closeOverlay, modName, overlayId, repeat } from '../../kit/index.ts';
import type { NormalAction } from '../../kit/normalKeys.ts';
import { createExecutor } from './execute.ts';
import { createKeyboardHold, createStatusLookup } from './keyboardHold.ts';
import { normalizeKey } from './keyEvent.ts';
import type { ParserState } from './parser.ts';
import { initialParserState, parseKey } from './parser.ts';

const modeKey = 'koja-modal';

const historyKey = 'koja-modal.history';

const refocusIntervalMilliseconds = 50;

const stopPress = (_event: unknown, cx: Context): void => {
  cx.stop_propagation();
};

const opensOverlay = (action: NormalAction): boolean =>
  action.kind === 'command' && action.command.startsWith('mod.open');

export default class KojaModal extends View {
  private handle: FocusHandle | null = null;

  private state: ParserState = initialParserState;

  private readonly hold = createKeyboardHold({
    isFocused: () => this.handle?.is_focused() ?? false,
    lookupStatus: createStatusLookup(exec),
    focus: () => {
      this.handle?.focus();
    },
  });

  private readonly executor = createExecutor({
    run,
    panes,
    focused,
    spaces,
    store: {
      get: (key) => shared(key),
      set: (key, value) => {
        setShared(key, value);
      },
    },
    historyKey,
  });

  override init(_props: unknown, cx: AsyncContext): void {
    const handle = cx.focus_handle();

    this.handle = handle;
    handle.focus();
    setShared(modeKey, true);
    this.executor.observe();
    this.keepKeyboard(cx);
    this.listenForCommands(cx);
  }

  override close(): void {
    this.executor.observe();
    setShared(modeKey, null);
    this.hold.close();

    const pane = focused()?.pane;

    if (pane !== null && pane !== undefined) {
      run('pane.focus', { pane });
    }
  }

  override render(): Element {
    const handle = this.handle;

    const root = div()
      .id(modName)
      .size_full()
      .on_key_down((event, cx) => {
        this.handleKey(event, cx);
      })
      .on_mouse_down('left', stopPress);

    return handle === null ? root : root.track_focus(handle);
  }

  private handleKey(event: KeyEvent, cx: Context): void {
    const result = parseKey(this.state, normalizeKey(event));

    this.state = result.state;

    if (result.status !== 'action') {
      return;
    }

    if (result.action.kind === 'leave') {
      closeOverlay(overlayId());

      return;
    }

    this.executor.execute(result.action);

    if (opensOverlay(result.action)) {
      this.hold.yield();

      return;
    }

    this.regainKeyboard(cx);
  }

  private regainKeyboard(cx: Context): void {
    this.hold.regain();

    cx.timer.after(0, () => {
      this.hold.check();
    });
  }

  private keepKeyboard(cx: AsyncContext): void {
    repeat(cx, refocusIntervalMilliseconds, () => {
      this.executor.observe();
      this.hold.check();
    });
  }

  private listenForCommands(cx: AsyncContext): void {
    cx.spawn(async () => {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop -- each key command is awaited in turn
        const command = await nextCommand();

        if (command === 'hold') {
          this.hold.check();
        }
      }
    });
  }
}
