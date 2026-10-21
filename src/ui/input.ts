import type { InputMode, TabRoute, WorkspaceCommand, WorkspaceReply } from '../client/client.ts';
import type { PaneId, WorkspaceId } from '../ids.ts';
import { kittyFlags, ModeFlag } from '../rows/rows.ts';
import { encodeKey, isKey, keyModifier, keyText, parseKey } from './keyEncoding.ts';
import type { KeyEvent } from './keyEncoding.ts';
import { createMouseCapture } from './mouseCapture.ts';
import { encodeMouse, parseMouse } from './mouseEncoding.ts';
import type { MouseEvent } from './mouseEncoding.ts';
import type { PaneAction } from './paneActions.ts';
import type { PaneTarget } from './screenTargets.ts';
import type { ScrollMotion } from './scrollMotions.ts';
import { createWorkspaceNavigation } from './workspaceNavigation.ts';
import type { WorkspaceKey } from './workspaceNavigation.ts';

export type ScrollAction =
  | { kind: 'enter' }
  | { kind: 'move'; motion: ScrollMotion }
  | { kind: 'leave' };

interface TokenRouterHost {
  mode: () => InputMode;
  setMode: (mode: InputMode) => void;
  modes: () => number;
  send: (bytes: Uint8Array) => void;
  // The pane cell under an outer cell, or the cell of the given pane nearest to it.
  mouseTarget: (x: number, y: number, pane?: PaneId) => PaneTarget | undefined;
  focusedPane: () => PaneId | undefined;
  // The workspace or tab whose label is drawn under an outer cell.
  chromeAt: (x: number, y: number) => ChromeTarget | undefined;
  focusPane: (pane: PaneId) => Promise<void>;
  paneModes: (pane: PaneId) => number;
  // The pane's current size, or undefined once the pane is gone.
  paneSize: (pane: PaneId) => { columns: number; rows: number } | undefined;
  sendToPane: (pane: PaneId, bytes: Uint8Array) => void;
  detach: () => void;
  workspaces: () => { ids: readonly WorkspaceId[]; focused: WorkspaceId | undefined };
  startDirectory: string;
  command: (command: WorkspaceCommand, onReply: (reply: WorkspaceReply) => void) => void;
  tab: (route: TabRoute) => void;
  tabPending: () => boolean;
  afterTabAnswer: (callback: () => void) => void;
  // The promise settles once the action's effect on the state has arrived.
  paneAction: (action: PaneAction) => Promise<void>;
  scroll: (action: ScrollAction) => void;
}

type ChromeTarget =
  | { kind: 'workspace'; workspaceId: WorkspaceId }
  | { kind: 'tab'; number: number };

type RoutedToken =
  | { kind: 'key'; raw: string; escapeSent: boolean }
  | { kind: 'paste'; bytes: Uint8Array; escapeSent: boolean }
  | { kind: 'mouse'; raw: string; escapeSent: boolean };

interface KeyRoute {
  bytes: Uint8Array;
  mode: InputMode;
  detach: boolean;
  workspace?: WorkspaceKey;
  tab?: TabRoute;
  paneAction?: PaneAction;
  scroll?: ScrollAction;
}

// What a key does, before any bytes are encoded. `sends` marks a key that reaches the pane.
interface KeyIntent extends Omit<KeyRoute, 'bytes'> {
  sends: boolean;
}

const workspaceKeys = new Map<string, WorkspaceKey>([
  ['j', 'next'],
  ['k', 'previous'],
  ['c', 'create'],
  ['X', 'close'],
]);

const encoder = new TextEncoder();

const decoder = new TextDecoder();

const nothing = new Uint8Array();

const escapeKey = '\x1b';

// Only a bare Escape can be completed by a continuation. A kitty Escape event is already whole.
const isBareEscape = (bytes: Uint8Array): boolean => decoder.decode(bytes) === escapeKey;

const pasteStart = encoder.encode('\x1b[200~');

const pasteEnd = encoder.encode('\x1b[201~');

const hasMode = (modes: number, flag: ModeFlag): boolean => (modes & flag) !== 0;

const applicationCursor = (modes: number): boolean =>
  hasMode(modes, ModeFlag.applicationCursorKeys);

const routeTabKey = (raw: string): TabRoute | undefined => {
  if (raw === 't') {
    return { kind: 'create' };
  }

  if (raw === 'H') {
    return { kind: 'previous' };
  }

  if (raw === 'L') {
    return { kind: 'next' };
  }

  if (raw.length === 1 && raw >= '1' && raw <= '9') {
    return { kind: 'number', number: Number(raw) };
  }

  return undefined;
};

const paneActions = new Map<string, PaneAction>([
  ['s', 'splitBelow'],
  ['v', 'splitRight'],
  ['h', 'focusPrevious'],
  ['l', 'focusNext'],
  ['x', 'close'],
  ['!', 'breakPane'],
  ['z', 'zoom'],
  ['<', 'resizeLeft'],
  ['>', 'resizeRight'],
  ['-', 'resizeUp'],
  ['+', 'resizeDown'],
]);

const scrollTextMotions = new Map<string, ScrollMotion>([
  ['h', 'left'],
  ['j', 'down'],
  ['k', 'up'],
  ['l', 'right'],
  ['w', 'wordStart'],
  ['b', 'wordStartPrevious'],
  ['e', 'wordEnd'],
  ['W', 'bigWordStart'],
  ['B', 'bigWordStartPrevious'],
  ['E', 'bigWordEnd'],
  ['0', 'lineStart'],
  ['^', 'firstNonBlank'],
  ['$', 'lineEnd'],
  ['{', 'paragraphPrevious'],
  ['}', 'paragraphNext'],
  ['g', 'historyTop'],
  ['G', 'historyBottom'],
]);

const scrollNamedMotions = new Map<string, ScrollMotion>([
  ['left', 'left'],
  ['down', 'down'],
  ['up', 'up'],
  ['right', 'right'],
  ['home', 'lineStart'],
  ['end', 'lineEnd'],
  ['pageUp', 'pageUp'],
  ['pageDown', 'pageDown'],
]);

const scrollControlMotions = new Map<string, ScrollMotion>([
  ['u', 'halfPageUp'],
  ['d', 'halfPageDown'],
  ['f', 'pageDown'],
]);

const isPrefix = (event: KeyEvent): boolean => isKey(event, 'b', keyModifier.ctrl);

// Normal-mode keys act on the plain key. Shift is allowed because some bindings are capitals.
const commandBlockers =
  keyModifier.alt | keyModifier.ctrl | keyModifier.super | keyModifier.hyper | keyModifier.meta;

const stayInScroll: KeyIntent = { sends: false, mode: 'scroll', detach: false };

const scrollMotionOf = (event: KeyEvent): ScrollMotion | undefined => {
  if ((event.modifiers & commandBlockers) === keyModifier.ctrl) {
    return isKey(event, event.key, keyModifier.ctrl)
      ? scrollControlMotions.get(event.key)
      : undefined;
  }

  if ((event.modifiers & commandBlockers) !== 0) {
    return undefined;
  }

  return scrollNamedMotions.get(event.key) ?? scrollTextMotions.get(keyText(event) ?? '');
};

const scrollIntent = (event: KeyEvent): KeyIntent => {
  if (event.kind === 'release') {
    return stayInScroll;
  }

  if (isPrefix(event)) {
    return { sends: false, mode: 'normal', detach: false, scroll: { kind: 'leave' } };
  }

  const leaves = keyText(event) === 'q' || isKey(event, 'escape');

  if (leaves && (event.modifiers & commandBlockers) === 0) {
    return { sends: false, mode: 'insert', detach: false, scroll: { kind: 'leave' } };
  }

  const motion = scrollMotionOf(event);

  if (motion === undefined) {
    return stayInScroll;
  }

  return { ...stayInScroll, scroll: { kind: 'move', motion } };
};

const normalIntent = (event: KeyEvent): KeyIntent => {
  if (isPrefix(event)) {
    return { sends: true, mode: 'insert', detach: false };
  }

  if ((event.modifiers & commandBlockers) !== 0) {
    return { sends: false, mode: 'normal', detach: false };
  }

  const raw = keyText(event) ?? '';

  if (raw === 'd') {
    return { sends: false, mode: 'insert', detach: true };
  }

  const workspace = workspaceKeys.get(raw);

  if (workspace !== undefined) {
    return { sends: false, mode: 'normal', detach: false, workspace };
  }

  const tab = routeTabKey(raw);

  if (tab !== undefined) {
    return { sends: false, mode: 'normal', detach: false, tab };
  }

  const paneAction = paneActions.get(raw);

  if (paneAction !== undefined) {
    return { sends: false, mode: 'normal', detach: false, paneAction };
  }

  if (raw === '[') {
    return { sends: false, mode: 'scroll', detach: false, scroll: { kind: 'enter' } };
  }

  const leavesNormal = raw === 'i' || isKey(event, 'escape');

  return { sends: false, mode: leavesNormal ? 'insert' : 'normal', detach: false };
};

const keyIntentOf = (event: KeyEvent, mode: InputMode): KeyIntent => {
  // Holding Ctrl+B repeats it. Only a new press may send a literal Ctrl+B or leave normal mode.
  if (event.kind === 'repeat' && isPrefix(event)) {
    return { sends: false, mode, detach: false };
  }

  if (mode === 'normal') {
    return normalIntent(event);
  }

  if (mode === 'scroll') {
    return scrollIntent(event);
  }

  if (isPrefix(event)) {
    return { sends: false, mode: 'normal', detach: false };
  }

  return { sends: true, mode: 'insert', detach: false };
};

// raw is the bytes of one key token, legacy or kitty. A release is never routed to the pane in
// normal mode.
export const routeKey = (raw: string, mode: InputMode, modes: number): KeyRoute => {
  const event = parseKey(raw);
  const { sends, ...intent } = keyIntentOf(event, mode);
  const bytes = sends ? encodeKey(event, kittyFlags(modes), applicationCursor(modes)) : nothing;

  return { bytes, ...intent };
};

export const routePaste = (bytes: Uint8Array, modes: number): Uint8Array => {
  if (!hasMode(modes, ModeFlag.bracketedPaste)) {
    return bytes;
  }

  const wrapped = new Uint8Array(pasteStart.length + bytes.length + pasteEnd.length);

  wrapped.set(pasteStart);
  wrapped.set(bytes, pasteStart.length);
  wrapped.set(pasteEnd, pasteStart.length + bytes.length);

  return wrapped;
};

// A token with escapeSent continues an Escape that the tokenizer already sent on. Its first routed
// byte is that Escape, so it is dropped, but only when the Escape really reached the pane: normal
// mode consumes an Escape. When the pane does not ask for bracketed paste, the pane keeps the stray
// Escape and gets the bare paste. A terminal reply that arrives split after a lone Escape cannot
// take that Escape back either.
export const createInputRouter = (host: TokenRouterHost): ((token: RoutedToken) => void) => {
  let escapeInPane = false;
  // Keys whose press Koja took. Their release must not reach the pane, which never saw the press.
  const consumedKeys = new Set<string>();
  const navigation = createWorkspaceNavigation(host);
  const mouseCapture = createMouseCapture(host);

  // Whether a pane action or a tab request keeps the queue from routing.
  let held = false;
  const queue: RoutedToken[] = [];

  const withoutSentEscape = (bytes: Uint8Array, escapeSent: boolean): Uint8Array =>
    escapeSent && escapeInPane ? bytes.subarray(1) : bytes;

  const trackConsumed = (event: KeyEvent, bytes: Uint8Array): void => {
    if (event.kind === 'release') {
      return;
    }

    if (bytes.length === 0) {
      consumedKeys.add(event.key);
    } else {
      consumedKeys.delete(event.key);
    }
  };

  const forwardMouse = (event: MouseEvent, target: PaneTarget): void => {
    const bytes = encodeMouse(event, host.paneModes(target.paneId), target.column, target.row);

    if (bytes.length > 0) {
      host.sendToPane(target.paneId, bytes);
    }
  };

  const focusChromeAt = (x: number, y: number): void => {
    const chrome = host.chromeAt(x, y);

    if (chrome === undefined) {
      return;
    }

    if (chrome.kind === 'tab') {
      host.tab({ kind: 'number', number: chrome.number });

      return;
    }

    navigation.focusByClick(chrome.workspaceId);
  };

  const routeMouse = (raw: string): Promise<void> | undefined => {
    const event = parseMouse(raw);

    if (event === undefined) {
      return undefined;
    }

    if (mouseCapture.ignores(event)) {
      return undefined;
    }

    const startsLeftPress = mouseCapture.begin(event) && event.button === 0;

    if (startsLeftPress) {
      focusChromeAt(event.x, event.y);
    }

    const placedTarget = mouseCapture.targetOf(event);
    const target = placedTarget ?? mouseCapture.unplacedRelease(event);

    mouseCapture.finish(event, placedTarget);

    if (target === undefined) {
      return undefined;
    }

    forwardMouse(event, target);

    const unfocused = target.paneId !== host.focusedPane();

    return startsLeftPress && unfocused ? host.focusPane(target.paneId) : undefined;
  };

  const route = (token: RoutedToken): Promise<void> | undefined => {
    if (token.kind === 'mouse') {
      const settled = routeMouse(token.raw);

      escapeInPane = false;

      return settled;
    }

    if (token.kind === 'paste') {
      const routed = routePaste(token.bytes, host.modes());
      const wrapped = routed.length > token.bytes.length;

      host.send(wrapped ? withoutSentEscape(routed, token.escapeSent) : routed);
      escapeInPane = false;

      return undefined;
    }

    const event = parseKey(token.raw);
    const routed = routeKey(token.raw, host.mode(), host.modes());

    if (event.kind === 'release' && consumedKeys.delete(event.key)) {
      return undefined;
    }

    trackConsumed(event, routed.bytes);

    host.send(withoutSentEscape(routed.bytes, token.escapeSent));
    host.setMode(routed.mode);

    if (routed.scroll !== undefined) {
      host.scroll(routed.scroll);
    }

    if (routed.detach) {
      host.detach();
    }

    if (routed.workspace !== undefined) {
      navigation.runKey(routed.workspace);
    }

    if (routed.tab !== undefined) {
      host.tab(routed.tab);
    }

    escapeInPane = token.raw === escapeKey && isBareEscape(routed.bytes);

    return routed.paneAction === undefined ? undefined : host.paneAction(routed.paneAction);
  };

  // Whether the token acts on the pane or tab the snapshot shows. Workspace keys do not: they
  // chain through pendingFocus.
  const readsSnapshot = (token: RoutedToken): boolean => {
    if (token.kind === 'mouse') {
      return true;
    }

    if (token.kind !== 'key') {
      return false;
    }

    const intent = keyIntentOf(parseKey(token.raw), host.mode());
    const entersScroll = intent.scroll?.kind === 'enter';

    return intent.paneAction !== undefined || intent.tab !== undefined || entersScroll;
  };

  const waitsForWorkspace = (next: RoutedToken): boolean => {
    if (!navigation.pending()) {
      return false;
    }

    return navigation.clickFocusing() || readsSnapshot(next);
  };

  const mustWait = (next: RoutedToken): boolean => host.tabPending() || waitsForWorkspace(next);

  // The client's snapshot changes only when the server answers a tab request. A token after the
  // request waits, so it reaches the pane the request shows and later tab keys see the new tab. A
  // token after a pane action waits for its answer for the same reason. A pane or tab key waits for
  // earlier workspace requests, which change the pane it targets. A pane action that fails to
  // settle only releases the tokens that follow it.
  const drain = (): void => {
    const release = (): void => {
      held = false;
      drain();
    };

    while (!held) {
      const next = queue[0];

      if (next === undefined || mustWait(next)) {
        break;
      }

      queue.shift();

      const settled = route(next);

      if (settled !== undefined) {
        held = true;

        settled.finally(release).catch(() => undefined);
      }
    }

    if (!held && queue.length > 0) {
      held = true;

      if (host.tabPending()) {
        host.afterTabAnswer(release);
      } else {
        navigation.afterSettled(release);
      }
    }
  };

  return (token) => {
    queue.push(token);
    drain();
  };
};
