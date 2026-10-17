import type { InputMode, TabRoute, WorkspaceCommand, WorkspaceReply } from '../client/client.ts';
import type { PaneId, WorkspaceId } from '../ids.ts';
import { kittyFlags, ModeFlag } from '../rows/rows.ts';
import { encodeKey, isKey, keyModifier, keyText, parseKey } from './keyEncoding.ts';
import type { KeyEvent } from './keyEncoding.ts';
import { encodeMouse, parseMouse } from './mouseEncoding.ts';
import type { MouseEvent } from './mouseEncoding.ts';
import type { PaneTarget } from './screenTargets.ts';
import type { ScrollMotion } from './scrollMotions.ts';

export type PaneAction =
  | 'splitBelow'
  | 'splitRight'
  | 'focusPrevious'
  | 'focusNext'
  | 'close'
  | 'breakPane'
  | 'zoom'
  | 'resizeLeft'
  | 'resizeRight'
  | 'resizeUp'
  | 'resizeDown';

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

type WorkspaceKey = 'next' | 'previous' | 'create' | 'close';

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

const workspaceKeys: Record<string, WorkspaceKey> = {
  j: 'next',
  k: 'previous',
  c: 'create',
  X: 'close',
};

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

const stayInScroll: KeyRoute = { bytes: nothing, mode: 'scroll', detach: false };

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

const routeScrollKey = (event: KeyEvent): KeyRoute => {
  if (event.kind === 'release') {
    return stayInScroll;
  }

  if (isPrefix(event)) {
    return { bytes: nothing, mode: 'normal', detach: false, scroll: { kind: 'leave' } };
  }

  const leaves = keyText(event) === 'q' || isKey(event, 'escape');

  if (leaves && (event.modifiers & commandBlockers) === 0) {
    return { bytes: nothing, mode: 'insert', detach: false, scroll: { kind: 'leave' } };
  }

  const motion = scrollMotionOf(event);

  if (motion === undefined) {
    return stayInScroll;
  }

  return { ...stayInScroll, scroll: { kind: 'move', motion } };
};

const routeNormalKey = (event: KeyEvent, modes: number): KeyRoute => {
  if (isPrefix(event)) {
    const bytes = encodeKey(event, kittyFlags(modes), applicationCursor(modes));

    return { bytes, mode: 'insert', detach: false };
  }

  if ((event.modifiers & commandBlockers) !== 0) {
    return { bytes: nothing, mode: 'normal', detach: false };
  }

  const raw = keyText(event) ?? '';

  if (raw === 'd') {
    return { bytes: nothing, mode: 'insert', detach: true };
  }

  const workspace = workspaceKeys[raw];

  if (workspace !== undefined) {
    return { bytes: nothing, mode: 'normal', detach: false, workspace };
  }

  const tab = routeTabKey(raw);

  if (tab !== undefined) {
    return { bytes: nothing, mode: 'normal', detach: false, tab };
  }

  const paneAction = paneActions.get(raw);

  if (paneAction !== undefined) {
    return { bytes: nothing, mode: 'normal', detach: false, paneAction };
  }

  if (raw === '[') {
    return { bytes: nothing, mode: 'scroll', detach: false, scroll: { kind: 'enter' } };
  }

  const leavesNormal = raw === 'i' || isKey(event, 'escape');

  return { bytes: nothing, mode: leavesNormal ? 'insert' : 'normal', detach: false };
};

// raw is the bytes of one key token, legacy or kitty. A release is never routed to the pane in
// normal mode.
export const routeKey = (raw: string, mode: InputMode, modes: number): KeyRoute => {
  const event = parseKey(raw);

  // Holding Ctrl+B repeats it. Only a new press may send a literal Ctrl+B or leave normal mode.
  if (event.kind === 'repeat' && isPrefix(event)) {
    return { bytes: nothing, mode, detach: false };
  }

  if (mode === 'normal') {
    return routeNormalKey(event, modes);
  }

  if (mode === 'scroll') {
    return routeScrollKey(event);
  }

  if (isPrefix(event)) {
    return { bytes: nothing, mode: 'normal', detach: false };
  }

  const bytes = encodeKey(event, kittyFlags(modes), applicationCursor(modes));

  return { bytes, mode: 'insert', detach: false };
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
const neighborCommand = (
  ids: readonly WorkspaceId[],
  focused: WorkspaceId | undefined,
  step: 1 | -1,
): WorkspaceCommand | undefined => {
  const index = focused === undefined ? -1 : ids.indexOf(focused);
  const target = ids[(index + step + ids.length) % ids.length];

  if (index === -1 || target === undefined) {
    return undefined;
  }

  return { action: 'focus', workspaceId: target };
};

const isButtonGesture = (event: MouseEvent): boolean =>
  event.kind === 'press' || event.kind === 'drag' || event.kind === 'release';

export const createInputRouter = (host: TokenRouterHost): ((token: RoutedToken) => void) => {
  let escapeInPane = false;
  // Keys whose press Phi took. Their release must not reach the pane, which never saw the press.
  const consumedKeys = new Set<string>();
  // The focus the last j or k asked for, kept until the server answers the latest focus request.
  let pendingFocus: WorkspaceId | undefined;
  let focusRequests = 0;
  // After c or X the resulting focus is unknown until the server answers.
  let awaitingResult = false;

  let workspaceWaiters: (() => void)[] = [];

  const workspacePending = (): boolean => focusRequests > 0 || awaitingResult;

  // Set by a workspace click. Every later token waits for the answer, so it reaches the new pane.
  let clickFocusing = false;

  const notifyWorkspaceWaiters = (): void => {
    if (workspacePending()) {
      return;
    }

    clickFocusing = false;

    const waiters = workspaceWaiters;

    workspaceWaiters = [];

    for (const waiter of waiters) {
      waiter();
    }
  };

  const settleFocus = (): void => {
    focusRequests -= 1;

    if (focusRequests === 0) {
      pendingFocus = undefined;
    }

    notifyWorkspaceWaiters();
  };

  const workspaceCommandOf = (key: WorkspaceKey): WorkspaceCommand | undefined => {
    if (awaitingResult) {
      return undefined;
    }

    const current = host.workspaces();
    const stillListed = current.ids.some((id) => id === pendingFocus);
    const focused = stillListed ? pendingFocus : current.focused;

    if (key === 'create') {
      return { action: 'create', root: host.startDirectory, label: undefined, focus: true };
    }

    if (key === 'close') {
      return focused === undefined ? undefined : { action: 'close', workspaceId: focused };
    }

    return neighborCommand(current.ids, focused, key === 'next' ? 1 : -1);
  };

  const focusWorkspace = (workspaceId: WorkspaceId): void => {
    pendingFocus = workspaceId;
    focusRequests += 1;
    host.command({ action: 'focus', workspaceId }, settleFocus);
  };

  const runWorkspaceKey = (key: WorkspaceKey): void => {
    const command = workspaceCommandOf(key);

    if (command === undefined) {
      return;
    }

    if (command.action === 'focus') {
      focusWorkspace(command.workspaceId);

      return;
    }

    awaitingResult = true;

    host.command(command, () => {
      awaitingResult = false;
      notifyWorkspaceWaiters();
    });
  };

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

  // The first press fixes the pane that gets its button's drags and release. Other buttons'
  // presses, drags, and releases are ignored until then.
  // `last` is the latest target forwarded to the pane. A release that finds the pane no longer
  // placed, such as after a tab switch or a zoom, goes there.
  let captured:
    | { button: number; pane: PaneId | undefined; last: PaneTarget | undefined }
    | undefined;

  const mouseTargetOf = (event: MouseEvent): PaneTarget | undefined => {
    const followsPress = event.kind === 'drag' || event.kind === 'release';

    if (captured === undefined || !followsPress) {
      return host.mouseTarget(event.x, event.y);
    }

    return captured.pane === undefined
      ? undefined
      : host.mouseTarget(event.x, event.y, captured.pane);
  };

  const forwardMouse = (event: MouseEvent, target: PaneTarget): void => {
    const bytes = encodeMouse(event, host.paneModes(target.paneId), target.column, target.row);

    if (bytes.length > 0) {
      host.sendToPane(target.paneId, bytes);
    }
  };

  const rememberTarget = (event: MouseEvent, target: PaneTarget | undefined): void => {
    const ownsGesture = isButtonGesture(event) && target?.paneId === captured?.pane;

    if (captured !== undefined && ownsGesture) {
      captured.last = target;
    }
  };

  const endGesture = (event: MouseEvent): void => {
    if (event.kind === 'release') {
      captured = undefined;
    }
  };

  // The saved cell, kept inside the pane's current size, which changes while the pane is hidden.
  const unplacedReleaseTarget = (event: MouseEvent): PaneTarget | undefined => {
    const last = captured?.last;

    if (event.kind !== 'release' || last === undefined) {
      return undefined;
    }

    const size = host.paneSize(last.paneId);

    if (size === undefined) {
      return undefined;
    }

    return {
      paneId: last.paneId,
      column: Math.min(last.column, size.columns - 1),
      row: Math.min(last.row, size.rows - 1),
    };
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

    const current = host.workspaces();
    const shown = pendingFocus ?? current.focused;

    if (chrome.workspaceId !== shown) {
      clickFocusing = true;
      focusWorkspace(chrome.workspaceId);
    }
  };

  // Captures the button and pane of a press that starts a gesture, and returns whether it did.
  const beginPress = (event: MouseEvent): boolean => {
    if (captured !== undefined || event.kind !== 'press') {
      return false;
    }

    const pressed = host.mouseTarget(event.x, event.y);

    captured = { button: event.button, pane: pressed?.paneId, last: pressed };

    return true;
  };

  const routeMouse = (raw: string): Promise<void> | undefined => {
    const event = parseMouse(raw);

    if (event === undefined) {
      return undefined;
    }

    if (captured !== undefined && isButtonGesture(event) && event.button !== captured.button) {
      return undefined;
    }

    const startsLeftPress = beginPress(event) && event.button === 0;

    if (startsLeftPress) {
      focusChromeAt(event.x, event.y);
    }

    const placedTarget = mouseTargetOf(event);
    const target = placedTarget ?? unplacedReleaseTarget(event);

    rememberTarget(event, placedTarget);
    endGesture(event);

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
      runWorkspaceKey(routed.workspace);
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

    const routed = routeKey(token.raw, host.mode(), host.modes());

    const entersScroll = routed.scroll?.kind === 'enter';

    return routed.paneAction !== undefined || routed.tab !== undefined || entersScroll;
  };

  const waitsForWorkspace = (): boolean => {
    const next = queue[0];

    if (next === undefined || !workspacePending()) {
      return false;
    }

    return clickFocusing || readsSnapshot(next);
  };

  const mustWait = (): boolean => host.tabPending() || waitsForWorkspace();

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

    while (!held && queue.length > 0 && !mustWait()) {
      const next = queue.shift();
      const settled = next === undefined ? undefined : route(next);

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
        workspaceWaiters.push(release);
      }
    }
  };

  return (token) => {
    queue.push(token);
    drain();
  };
};
