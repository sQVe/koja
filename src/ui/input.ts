import type { InputMode, TabRoute, WorkspaceCommand, WorkspaceReply } from '../client/client.ts';
import type { WorkspaceId } from '../ids.ts';
import { kittyFlags, ModeFlag } from '../rows/rows.ts';
import { encodeKey, isKey, keyModifier, keyText, parseKey } from './keyEncoding.ts';
import type { KeyEvent } from './keyEncoding.ts';

export type PaneAction =
  | 'splitBelow'
  | 'splitRight'
  | 'focusPrevious'
  | 'focusNext'
  | 'close'
  | 'zoom'
  | 'resizeLeft'
  | 'resizeRight'
  | 'resizeUp'
  | 'resizeDown';

interface TokenRouterHost {
  mode: () => InputMode;
  setMode: (mode: InputMode) => void;
  modes: () => number;
  send: (bytes: Uint8Array) => void;
  detach: () => void;
  workspaces: () => { ids: readonly WorkspaceId[]; focused: WorkspaceId | undefined };
  startDirectory: string;
  command: (command: WorkspaceCommand, onReply: (reply: WorkspaceReply) => void) => void;
  tab: (route: TabRoute) => void;
  tabPending: () => boolean;
  afterTabAnswer: (callback: () => void) => void;
  // The promise settles once the action's effect on the state has arrived.
  paneAction: (action: PaneAction) => Promise<void>;
}

type WorkspaceKey = 'next' | 'previous' | 'create' | 'close';

type RoutedToken =
  | { kind: 'key'; raw: string; escapeSent: boolean }
  | { kind: 'paste'; bytes: Uint8Array; escapeSent: boolean };

interface KeyRoute {
  bytes: Uint8Array;
  mode: InputMode;
  detach: boolean;
  workspace?: WorkspaceKey;
  tab?: TabRoute;
  paneAction?: PaneAction;
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
const isBareEscape = (bytes: Uint8Array): boolean =>
  bytes.length === 1 && decoder.decode(bytes) === escapeKey;

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
  ['z', 'zoom'],
  ['<', 'resizeLeft'],
  ['>', 'resizeRight'],
  ['-', 'resizeUp'],
  ['+', 'resizeDown'],
]);

const isPrefix = (event: KeyEvent): boolean => isKey(event, 'b', keyModifier.ctrl);

const routeNormalKey = (event: KeyEvent, modes: number): KeyRoute => {
  if (isPrefix(event)) {
    const bytes = encodeKey(event, kittyFlags(modes), applicationCursor(modes));

    return { bytes, mode: 'insert', detach: false };
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

  const leavesNormal = raw === 'i' || isKey(event, 'escape');

  return { bytes: nothing, mode: leavesNormal ? 'insert' : 'normal', detach: false };
};

// raw is the bytes of one key token, legacy or kitty. A release is never routed to the pane in
// normal mode.
export const routeKey = (raw: string, mode: InputMode, modes: number): KeyRoute => {
  const event = parseKey(raw);

  if (mode === 'normal') {
    return routeNormalKey(event, modes);
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

  const notifyWorkspaceWaiters = (): void => {
    if (workspacePending()) {
      return;
    }

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
    const stillListed = pendingFocus !== undefined && current.ids.includes(pendingFocus);
    const focused = stillListed ? pendingFocus : current.focused;

    if (key === 'create') {
      return { action: 'create', root: host.startDirectory, label: undefined, background: false };
    }

    if (key === 'close') {
      return focused === undefined ? undefined : { action: 'close', workspaceId: focused };
    }

    return neighborCommand(current.ids, focused, key === 'next' ? 1 : -1);
  };

  const runWorkspaceKey = (key: WorkspaceKey): void => {
    const command = workspaceCommandOf(key);

    if (command === undefined) {
      return;
    }

    if (command.action === 'focus') {
      pendingFocus = command.workspaceId;
      focusRequests += 1;
      host.command(command, settleFocus);

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

  const route = (token: RoutedToken): Promise<void> | undefined => {
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
    if (token.kind === 'paste') {
      return false;
    }

    const routed = routeKey(token.raw, host.mode(), host.modes());

    return routed.paneAction !== undefined || routed.tab !== undefined;
  };

  const waitsForWorkspace = (): boolean => {
    const next = queue[0];

    return next !== undefined && workspacePending() && readsSnapshot(next);
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
