import type { InputMode, WorkspaceCommand } from '../client/client.ts';
import type { WorkspaceId } from '../ids.ts';
import { ModeFlag } from '../rows/rows.ts';

interface TokenRouterHost {
  mode: () => InputMode;
  setMode: (mode: InputMode) => void;
  modes: () => number;
  send: (bytes: Uint8Array) => void;
  detach: () => void;
  workspaces: () => { ids: readonly WorkspaceId[]; focused: WorkspaceId | undefined };
  // The directory a created workspace is rooted at.
  startDirectory: string;
  command: (command: WorkspaceCommand) => void;
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
}

const workspaceKeys: Record<string, WorkspaceKey> = {
  j: 'next',
  k: 'previous',
  c: 'create',
  X: 'close',
};

const encoder = new TextEncoder();

const nothing = new Uint8Array();

const prefixKey = '\x02';

const escapeKey = '\x1b';

const cursorKeyTails = 'ABCDHF';

const pasteStart = encoder.encode('\x1b[200~');

const pasteEnd = encoder.encode('\x1b[201~');

const hasMode = (modes: number, flag: ModeFlag): boolean => (modes & flag) !== 0;

const encodeInsertKey = (raw: string, modes: number): Uint8Array => {
  const tail = raw.slice(2);
  const isCursorKey = raw.startsWith('\x1b[') && tail.length === 1 && cursorKeyTails.includes(tail);

  if (!isCursorKey || !hasMode(modes, ModeFlag.applicationCursorKeys)) {
    return encoder.encode(raw);
  }

  return encoder.encode(`\x1bO${tail}`);
};

const routeNormalKey = (raw: string): KeyRoute => {
  if (raw === prefixKey) {
    return { bytes: encoder.encode(prefixKey), mode: 'insert', detach: false };
  }

  if (raw === 'd') {
    return { bytes: nothing, mode: 'insert', detach: true };
  }

  const workspace = workspaceKeys[raw];

  if (workspace !== undefined) {
    return { bytes: nothing, mode: 'normal', detach: false, workspace };
  }

  const leavesNormal = raw === 'i' || raw === escapeKey;

  return { bytes: nothing, mode: leavesNormal ? 'insert' : 'normal', detach: false };
};

// raw is a key's legacy bytes. Kitty key reporting must stay off, or the bytes are not legacy.
export const routeKey = (raw: string, mode: InputMode, modes: number): KeyRoute => {
  if (mode === 'normal') {
    return routeNormalKey(raw);
  }

  if (raw === prefixKey) {
    return { bytes: nothing, mode: 'normal', detach: false };
  }

  return { bytes: encodeInsertKey(raw, modes), mode: 'insert', detach: false };
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

const snapshotKey = ({ ids, focused }: ReturnType<TokenRouterHost['workspaces']>): string =>
  `${focused ?? ''}|${ids.join(',')}`;

export const createInputRouter = (host: TokenRouterHost): ((token: RoutedToken) => void) => {
  let escapeInPane = false;
  // The focus the last j or k asked for, until the snapshot shows it or the workspace is gone.
  let pendingFocus: WorkspaceId | undefined;
  // The snapshot that was current when c or X ran. Their result is unknown until it changes.
  let blockedAt: string | undefined;

  const workspaceCommandOf = (key: WorkspaceKey): WorkspaceCommand | undefined => {
    const current = host.workspaces();
    const currentKey = snapshotKey(current);

    if (blockedAt === currentKey) {
      return undefined;
    }

    blockedAt = undefined;

    const pendingReached = pendingFocus === current.focused;
    const pendingGone = pendingFocus !== undefined && !current.ids.includes(pendingFocus);

    if (pendingReached || pendingGone) {
      pendingFocus = undefined;
    }

    const focused = pendingFocus ?? current.focused;

    if (key === 'create') {
      blockedAt = currentKey;

      return { action: 'create', root: host.startDirectory, label: undefined, background: false };
    }

    if (key === 'close') {
      if (focused === undefined) {
        return undefined;
      }

      blockedAt = currentKey;
      pendingFocus = undefined;

      return { action: 'close', workspaceId: focused };
    }

    const command = neighborCommand(current.ids, focused, key === 'next' ? 1 : -1);

    if (command?.action === 'focus') {
      pendingFocus = command.workspaceId;
    }

    return command;
  };

  const withoutSentEscape = (bytes: Uint8Array, escapeSent: boolean): Uint8Array =>
    escapeSent && escapeInPane ? bytes.subarray(1) : bytes;

  return (token) => {
    if (token.kind === 'paste') {
      const routed = routePaste(token.bytes, host.modes());
      const wrapped = routed.length > token.bytes.length;

      host.send(wrapped ? withoutSentEscape(routed, token.escapeSent) : routed);
      escapeInPane = false;

      return;
    }

    const routed = routeKey(token.raw, host.mode(), host.modes());

    host.send(withoutSentEscape(routed.bytes, token.escapeSent));
    host.setMode(routed.mode);

    if (routed.detach) {
      host.detach();
    }

    if (routed.workspace !== undefined) {
      const command = workspaceCommandOf(routed.workspace);

      if (command !== undefined) {
        host.command(command);
      }
    }

    escapeInPane = token.raw === escapeKey && routed.bytes.length > 0;
  };
};
