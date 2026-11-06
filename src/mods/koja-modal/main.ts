import type { AsyncContext, Context, Element, FocusHandle, KeyEvent } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import { exec, focused, nextCommand, panes, run, setShared, shared } from 'herdr';

import {
  askFirst,
  closeOverlay,
  modName,
  overlayCloseCount,
  overlayId,
  repeat,
} from '../../kit/index.ts';
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

const overlayCommands = new Set(['mod.open', 'app.help']);

// The find bar takes typing inside the terminal and lists no overlay in the status, so the hold
// would take the keyboard back from it. Normal mode closes instead.
const inlineInputCommands = new Set(['terminal.search']);

const opensOverlay = (action: NormalAction): boolean =>
  action.kind === 'command' && overlayCommands.has(action.command);

const opensInlineInput = (action: NormalAction): boolean =>
  action.kind === 'command' && inlineInputCommands.has(action.command);

export default class KojaModal extends View {
  private handle: FocusHandle | null = null;

  private state: ParserState = initialParserState;

  private dialogOpened = false;

  private readonly hold = createKeyboardHold({
    isFocused: () => this.handle?.is_focused() ?? false,
    overlayCloseCount,
    lookupStatus: createStatusLookup(exec),
    focus: () => {
      this.handle?.focus();
    },
  });

  private readonly executor = createExecutor({
    run: (command, args) => {
      this.dialogOpened = askFirst(command, args);
    },
    panes,
    focused,
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
    this.handleKeyName(normalizeKey(event), cx);
  }

  private handleKeyName(key: string, cx: Context): void {
    const result = parseKey(this.state, key);

    this.state = result.state;

    if (result.status !== 'action') {
      return;
    }

    if (result.action.kind === 'leave') {
      closeOverlay(overlayId());

      return;
    }

    this.dialogOpened = false;
    this.executor.execute(result.action);

    if (opensInlineInput(result.action)) {
      closeOverlay(overlayId());

      return;
    }

    if (opensOverlay(result.action) || this.openedDialog()) {
      this.hold.yield();

      return;
    }

    this.regainKeyboard(cx);
  }

  private openedDialog(): boolean {
    return this.dialogOpened;
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
          this.handleKeyName('ctrl-b', cx);
          this.hold.check();
        }
      }
    });
  }
}
