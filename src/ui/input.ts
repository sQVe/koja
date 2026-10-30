import { actionCatalog, actionForKey, availableActions } from '../actions.ts';
import type { ActionCatalog, ActionIntent, PaneAction } from '../actions.ts';
import type {
  InputMode,
  StoreSnapshot,
  TabRoute,
  WorkspaceCommand,
  WorkspaceReply,
} from '../client/client.ts';
import type { PaneId, WorkspaceId } from '../ids.ts';
import type { LayoutChoice } from '../layout.ts';
import { kittyFlags, ModeFlag } from '../rows/rows.ts';
import type { ActionView, ActionViewInput } from './actionView.ts';
import { viewKeyOf } from './actionView.ts';
import { encodeKey, isKey, keyModifier, keyText, parseKey } from './keyEncoding.ts';
import type { KeyEvent } from './keyEncoding.ts';
import { createMouseRouting } from './mouseRouting.ts';
import type { ChromeTarget } from './mouseRouting.ts';
import type { PanePaste } from './panePaste.ts';
import type { PaneTarget } from './screenTargets.ts';
import type { ScrollMotion } from './scrollMotions.ts';
import { createWorkspaceNavigation } from './workspaceNavigation.ts';

export type ScrollAction =
  | { kind: 'enter' }
  | { kind: 'move'; motion: ScrollMotion }
  | { kind: 'leave' };

interface TokenRouterHost {
  mode: () => InputMode;
  snapshot: () => StoreSnapshot;
  catalog: ActionCatalog;
  view: ActionView;
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
  workspaces: () => {
    ids: readonly WorkspaceId[];
    focused: WorkspaceId | undefined;
  };
  startDirectory: string;
  command: (command: WorkspaceCommand, onReply: (reply: WorkspaceReply) => void) => void;
  tab: (route: TabRoute) => void;
  tabPending: () => boolean;
  tabLayout: (choice: LayoutChoice) => void;
  afterTabAnswer: (callback: () => void) => void;
  // The promise settles once the action's effect on the state has arrived.
  paneAction: (action: PaneAction) => Promise<void>;
  scroll: (action: ScrollAction) => void;
  pasteFlow: PanePaste;
}

type RoutedToken =
  | { kind: 'key'; raw: string; escapeSent: boolean }
  | { kind: 'paste'; bytes: Uint8Array; escapeSent: boolean }
  | { kind: 'mouse'; raw: string; escapeSent: boolean };

type KeyEffect = ActionIntent | { kind: 'scroll'; action: ScrollAction };

interface KeyRoute {
  bytes: Uint8Array;
  mode: InputMode;
  effect: KeyEffect | undefined;
}

// What a key does, before any bytes are encoded. `sends` marks a key that reaches the pane.
interface KeyIntent {
  sends: boolean;
  mode: InputMode;
  effect: KeyEffect | undefined;
}

const encoder = new TextEncoder();

const decoder = new TextDecoder();

const nothing = new Uint8Array();

const escapeKey = '\x1b';

// Only a bare Escape can be completed by a continuation. A kitty Escape event is already whole.
const isBareEscape = (bytes: Uint8Array): boolean => decoder.decode(bytes) === escapeKey;

const snapshotEffects: ReadonlySet<KeyEffect['kind']> = new Set([
  'pane',
  'tab',
  'layout',
  'scrollEnter',
  'paste',
]);

const pasteStart = encoder.encode('\x1b[200~');

const pasteEnd = encoder.encode('\x1b[201~');

const hasMode = (modes: number, flag: ModeFlag): boolean => (modes & flag) !== 0;

const applicationCursor = (modes: number): boolean =>
  hasMode(modes, ModeFlag.applicationCursorKeys);

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

const stayInScroll: KeyIntent = {
  sends: false,
  mode: 'scroll',
  effect: undefined,
};

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
    return {
      sends: false,
      mode: 'normal',
      effect: { kind: 'scroll', action: { kind: 'leave' } },
    };
  }

  const leaves = keyText(event) === 'q' || isKey(event, 'escape');

  if (leaves && (event.modifiers & commandBlockers) === 0) {
    return {
      sends: false,
      mode: 'insert',
      effect: { kind: 'scroll', action: { kind: 'leave' } },
    };
  }

  const motion = scrollMotionOf(event);

  if (motion === undefined) {
    return stayInScroll;
  }

  return {
    ...stayInScroll,
    effect: { kind: 'scroll', action: { kind: 'move', motion } },
  };
};

const viewInputOf = (token: Exclude<RoutedToken, { kind: 'mouse' }>): ActionViewInput =>
  token.kind === 'paste'
    ? { kind: 'paste', bytes: token.bytes }
    : { kind: 'key', event: parseKey(token.raw) };

const modeAfter = (intent: ActionIntent): InputMode => {
  if (intent.kind === 'detach') {
    return 'insert';
  }

  return intent.kind === 'scrollEnter' ? 'scroll' : 'normal';
};

const normalIntent = (event: KeyEvent, catalog: ActionCatalog): KeyIntent => {
  if (isPrefix(event)) {
    return { sends: true, mode: 'insert', effect: undefined };
  }

  if ((event.modifiers & commandBlockers) !== 0) {
    return { sends: false, mode: 'normal', effect: undefined };
  }

  const raw = keyText(event) ?? '';
  const action = actionForKey(catalog, raw);

  if (action !== undefined) {
    return {
      sends: false,
      mode: modeAfter(action.intent),
      effect: action.intent,
    };
  }

  const leavesNormal = raw === 'i' || isKey(event, 'escape');

  return {
    sends: false,
    mode: leavesNormal ? 'insert' : 'normal',
    effect: undefined,
  };
};

const isCloseKey = (event: KeyEvent, catalog: ActionCatalog): boolean => {
  const action = actionForKey(catalog, keyText(event) ?? '');

  return action?.intent.kind === 'pane' && action.intent.action === 'close';
};

const keyIntentOf = (event: KeyEvent, mode: InputMode, catalog: ActionCatalog): KeyIntent => {
  // Holding Ctrl+B repeats it. Only a new press may send a literal Ctrl+B or leave normal mode.
  if (event.kind === 'repeat' && isPrefix(event)) {
    return { sends: false, mode, effect: undefined };
  }

  if (event.kind === 'repeat' && mode === 'normal' && isCloseKey(event, catalog)) {
    return { sends: false, mode, effect: undefined };
  }

  if (mode === 'normal') {
    return normalIntent(event, catalog);
  }

  if (mode === 'scroll') {
    return scrollIntent(event);
  }

  if (isPrefix(event)) {
    return { sends: false, mode: 'normal', effect: undefined };
  }

  return { sends: true, mode: 'insert', effect: undefined };
};

// raw is the bytes of one key token, legacy or kitty. A release is never routed to the pane in
// normal mode.
export const routeKey = (
  raw: string,
  mode: InputMode,
  modes: number,
  catalog: ActionCatalog = actionCatalog,
): KeyRoute => {
  const event = parseKey(raw);
  const { sends, ...intent } = keyIntentOf(event, mode, catalog);
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
  let escapeInView = false;
  // Keys whose press Koja took. Their release must not reach the pane, which never saw the press.
  const consumedKeys = new Set<string>();
  const navigation = createWorkspaceNavigation(host);
  const mouse = createMouseRouting(host, navigation);
  const availableCatalog = (): ActionCatalog => availableActions(host.catalog, host.snapshot());

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

  const runEffect = (effect: KeyEffect): Promise<void> | undefined => {
    if (effect.kind === 'scroll') {
      host.scroll(effect.action);
    }

    if (effect.kind === 'scrollEnter') {
      host.scroll({ kind: 'enter' });
    }

    if (effect.kind === 'detach') {
      mouse.releaseGesture();
      host.detach();
    }

    if (effect.kind === 'workspace') {
      navigation.runKey(effect.key);
    }

    if (effect.kind === 'tab') {
      host.tab(effect.route);
    }

    if (effect.kind === 'layout') {
      host.tabLayout(effect.choice);
    }

    if (effect.kind === 'view') {
      host.view.open(effect.view);
    }

    if (effect.kind === 'paste') {
      host.pasteFlow.fromClipboard();
    }

    return effect.kind === 'pane' ? host.paneAction(effect.action) : undefined;
  };

  const keepFromPane = (token: RoutedToken): void => {
    if (token.kind === 'key') {
      trackConsumed(parseKey(token.raw), nothing);
    }

    if (token.kind === 'mouse') {
      mouse.keep(token.raw);
    }
  };

  const routeWhileViewOpen = (token: RoutedToken): Promise<void> | undefined => {
    escapeInPane = false;
    escapeInView = token.kind === 'key' && token.raw === escapeKey;
    keepFromPane(token);

    if (token.kind === 'mouse') {
      return undefined;
    }

    const intent = host.view.interact(viewInputOf(token), host.catalog, host.snapshot());

    if (intent === undefined) {
      return undefined;
    }

    host.setMode(modeAfter(intent));

    return runEffect(intent);
  };

  const startsPaste = (event: KeyEvent): boolean =>
    host.mode() === 'normal' &&
    keyIntentOf(event, 'normal', availableCatalog()).effect?.kind === 'paste';

  const answersPrompt = (token: RoutedToken): boolean => {
    if (token.kind !== 'key') {
      return false;
    }

    const event = parseKey(token.raw);

    if (startsPaste(event) || !host.pasteFlow.takeKey(event)) {
      return false;
    }

    keepFromPane(token);
    escapeInPane = false;
    escapeInView = token.raw === escapeKey;

    return true;
  };

  const routePasteToken = (bytes: Uint8Array, escapeSent: boolean): void => {
    if (!host.pasteFlow.fromHost(decoder.decode(bytes))) {
      const routed = routePaste(bytes, host.modes());
      const wrapped = routed.length > bytes.length;

      host.send(wrapped ? withoutSentEscape(routed, escapeSent) : routed);
    }

    escapeInPane = false;
  };

  const route = (token: RoutedToken): Promise<void> | undefined => {
    const continuesViewEscape = token.escapeSent && escapeInView;

    if (continuesViewEscape) {
      escapeInView = false;
      keepFromPane(token);

      return undefined;
    }

    if (answersPrompt(token)) {
      return undefined;
    }

    if (host.view.getState().kind !== 'closed') {
      return routeWhileViewOpen(token);
    }

    escapeInView = false;

    if (token.kind === 'mouse') {
      const settled = mouse.route(token.raw);

      escapeInPane = false;

      return settled;
    }

    if (token.kind === 'paste') {
      routePasteToken(token.bytes, token.escapeSent);

      return undefined;
    }

    const event = parseKey(token.raw);
    const routed = routeKey(token.raw, host.mode(), host.modes(), availableCatalog());

    if (event.kind === 'release' && consumedKeys.delete(event.key)) {
      return undefined;
    }

    trackConsumed(event, routed.bytes);

    host.send(withoutSentEscape(routed.bytes, token.escapeSent));

    host.setMode(routed.mode);

    const settled = routed.effect === undefined ? undefined : runEffect(routed.effect);

    escapeInPane = token.raw === escapeKey && isBareEscape(routed.bytes);

    return settled;
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

    if (host.view.getState().kind !== 'closed') {
      return viewKeyOf(parseKey(token.raw)).kind === 'run';
    }

    const { effect } = keyIntentOf(parseKey(token.raw), host.mode(), host.catalog);

    return effect !== undefined && snapshotEffects.has(effect.kind);
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
