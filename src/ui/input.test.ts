import { expect, it } from 'bun:test';

import type { InputMode, TabRoute, WorkspaceCommand } from '../client/client.ts';
import { paneId, workspaceId } from '../ids.ts';
import type { PaneId, WorkspaceId } from '../ids.ts';
import { ModeFlag } from '../rows/rows.ts';
import { createInputRouter, routeKey, routePaste } from './input.ts';
import type { PaneAction, ScrollAction } from './input.ts';
import { createInputTokenizer } from './inputTokens.ts';
import type { ScrollMotion } from './scrollMotions.ts';

type RouterHost = Parameters<typeof createInputRouter>[0];

interface GonePanes {
  unplaced: Set<PaneId>;
  missing: Set<PaneId>;
  sizes: Map<PaneId, { columns: number; rows: number }>;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const key = (raw: string, mode: InputMode, modes = 0) => {
  const routed = routeKey(raw, mode, modes);

  return { text: decoder.decode(routed.bytes), mode: routed.mode };
};

const paste = (text: string, modes = 0) => decoder.decode(routePaste(encoder.encode(text), modes));

it('sends a cursor key as an application key in insert mode when the pane asks for it', () => {
  expect(key('\x1b[A', 'insert', ModeFlag.applicationCursorKeys)).toEqual({
    text: '\x1bOA',
    mode: 'insert',
  });
});

it('keeps a cursor key as it is when the pane does not ask for application keys', () => {
  for (const tail of ['A', 'B', 'C', 'D', 'H', 'F']) {
    expect(key(`\x1b[${tail}`, 'insert')).toEqual({ text: `\x1b[${tail}`, mode: 'insert' });
  }
});

it('changes every cursor key in application cursor mode', () => {
  for (const tail of ['A', 'B', 'C', 'D', 'H', 'F']) {
    expect(key(`\x1b[${tail}`, 'insert', ModeFlag.applicationCursorKeys).text).toBe(`\x1bO${tail}`);
  }
});

it('keeps a key with a modifier as it is in application cursor mode', () => {
  expect(key('\x1b[1;5A', 'insert', ModeFlag.applicationCursorKeys).text).toBe('\x1b[1;5A');
});

it('sends keys, Ctrl+C, and Escape raw in insert mode', () => {
  expect(key('a', 'insert')).toEqual({ text: 'a', mode: 'insert' });
  expect(key('\x03', 'insert')).toEqual({ text: '\x03', mode: 'insert' });
  expect(key('\x1b', 'insert')).toEqual({ text: '\x1b', mode: 'insert' });
});

it('enters normal mode on Ctrl+B and sends nothing', () => {
  expect(key('\x02', 'insert')).toEqual({ text: '', mode: 'normal' });
});

it('sends one literal Ctrl+B when it is pressed twice from insert mode', () => {
  const first = key('\x02', 'insert');
  const second = key('\x02', first.mode);

  expect(first.text + second.text).toBe('\x02');
  expect(second.mode).toBe('insert');
});

it('returns to insert mode on i or Escape without sending anything', () => {
  expect(key('i', 'normal')).toEqual({ text: '', mode: 'insert' });
  expect(key('\x1b', 'normal')).toEqual({ text: '', mode: 'insert' });
});

it('asks to detach on d in normal mode, sends nothing, and returns to insert mode', () => {
  expect(routeKey('d', 'normal', 0)).toEqual({
    bytes: new Uint8Array(),
    mode: 'insert',
    detach: true,
  });
});

it('does not ask to detach for d in insert mode or other keys in normal mode', () => {
  expect(routeKey('d', 'insert', 0).detach).toBe(false);
  expect(routeKey('i', 'normal', 0).detach).toBe(false);
});

it('enters scroll mode on [ in normal mode and returns to insert mode on q', () => {
  const entered = routeKey('[', 'normal', 0);

  expect(entered).toEqual({
    bytes: new Uint8Array(),
    mode: 'scroll',
    detach: false,
    scroll: { kind: 'enter' },
  });

  expect(routeKey('q', 'scroll', 0)).toEqual({
    bytes: new Uint8Array(),
    mode: 'insert',
    detach: false,
    scroll: { kind: 'leave' },
  });
});

it('leaves scroll mode on Escape and sends nothing', () => {
  expect(routeKey('\x1b', 'scroll', 0)).toMatchObject({
    bytes: new Uint8Array(),
    mode: 'insert',
    scroll: { kind: 'leave' },
  });

  expect(routeKey('\x1b[27u', 'scroll', 0)).toMatchObject({
    mode: 'insert',
    scroll: { kind: 'leave' },
  });
});

it('treats Ctrl+B in scroll mode as the prefix, which leaves scroll mode', () => {
  for (const raw of ['\x02', '\x1b[98;5u']) {
    expect(routeKey(raw, 'scroll', 0)).toEqual({
      bytes: new Uint8Array(),
      mode: 'normal',
      detach: false,
      scroll: { kind: 'leave' },
    });
  }
});

const scrollKeys: [string, ScrollMotion][] = [
  ['h', 'left'],
  ['j', 'down'],
  ['k', 'up'],
  ['l', 'right'],
  ['\x1b[D', 'left'],
  ['\x1b[B', 'down'],
  ['\x1b[A', 'up'],
  ['\x1b[C', 'right'],
  ['w', 'wordStart'],
  ['b', 'wordStartPrevious'],
  ['e', 'wordEnd'],
  ['W', 'bigWordStart'],
  ['B', 'bigWordStartPrevious'],
  ['E', 'bigWordEnd'],
  ['0', 'lineStart'],
  ['\x1b[H', 'lineStart'],
  ['^', 'firstNonBlank'],
  ['$', 'lineEnd'],
  ['\x1b[F', 'lineEnd'],
  ['{', 'paragraphPrevious'],
  ['}', 'paragraphNext'],
  ['\x1b[5~', 'pageUp'],
  ['\x1b[6~', 'pageDown'],
  ['\x15', 'halfPageUp'],
  ['\x04', 'halfPageDown'],
  ['\x06', 'pageDown'],
  ['g', 'historyTop'],
  ['G', 'historyBottom'],
];

for (const [raw, motion] of scrollKeys) {
  it(`moves ${motion} on ${JSON.stringify(raw)} in scroll mode, sending nothing to the pane`, () => {
    expect(routeKey(raw, 'scroll', 0)).toEqual({
      bytes: new Uint8Array(),
      mode: 'scroll',
      detach: false,
      scroll: { kind: 'move', motion },
    });
  });
}

it('ignores other keys, Alt keys, and releases in scroll mode', () => {
  for (const raw of ['a', 'i', 'd', 'x', '\x1bh', '\x1b[104;1:3u', '\x1b[66;1:3u', '\x1b[1;3A']) {
    expect(routeKey(raw, 'scroll', 0)).toEqual({
      bytes: new Uint8Array(),
      mode: 'scroll',
      detach: false,
    });
  }
});

it('sends nothing for other keys in normal mode', () => {
  expect(key('a', 'normal')).toEqual({ text: '', mode: 'normal' });

  expect(key('\x1b[A', 'normal', ModeFlag.applicationCursorKeys)).toEqual({
    text: '',
    mode: 'normal',
  });
});

it('sends pasted bytes unchanged when the pane has no bracketed paste', () => {
  expect(paste('a\r\n\x1b[200~b')).toBe('a\r\n\x1b[200~b');
});

it('wraps pasted bytes in markers when the pane has bracketed paste', () => {
  expect(paste('one\ntwo', ModeFlag.bracketedPaste)).toBe('\x1b[200~one\ntwo\x1b[201~');
});

it('sends a paste in normal mode and keeps the mode', () => {
  const normal = routeKey('\x02', 'insert', 0).mode;

  expect(normal).toBe('normal');
  expect(paste('abc', ModeFlag.bracketedPaste)).toBe('\x1b[200~abc\x1b[201~');
  expect(paste('abc')).toBe('abc');
  expect(key('a', normal).mode).toBe('normal');
});

const firstWorkspace = workspaceId(1);
const secondWorkspace = workspaceId(2);

const router = (
  initial: InputMode,
  initialModes: number,
  focusedWorkspace: WorkspaceId | 'none' = firstWorkspace,
) => {
  let mode = initial;
  let modes = initialModes;
  const sent: string[] = [];
  let detaches = 0;
  const commands: WorkspaceCommand[] = [];
  const actions: PaneAction[] = [];
  const scrolls: ScrollAction[] = [];
  const answers: (() => void)[] = [];

  const input = createInputRouter({
    mode: () => mode,
    setMode: (next) => {
      mode = next;
    },
    modes: () => modes,
    send: (bytes) => {
      if (bytes.length > 0) {
        sent.push(decoder.decode(bytes));
      }
    },
    tab: () => undefined,
    tabPending: () => false,
    afterTabAnswer: () => undefined,
    mouseTarget: () => undefined,
    focusedPane: () => undefined,
    chromeAt: () => undefined,
    focusPane: () => Promise.resolve(),
    paneModes: () => 0,
    paneSize: () => ({ columns: 80, rows: 24 }),
    sendToPane: () => undefined,
    detach: () => {
      detaches += 1;
    },
    workspaces: () => ({
      ids: [firstWorkspace, secondWorkspace],
      focused: focusedWorkspace === 'none' ? undefined : focusedWorkspace,
    }),
    startDirectory: '/work/start',
    command: (command) => {
      commands.push(command);
    },
    scroll: (action) => {
      scrolls.push(action);
    },
    paneAction: (action) => {
      actions.push(action);

      return new Promise((resolve) => {
        answers.push(resolve);
      });
    },
  });

  const answer = async (): Promise<void> => {
    answers.shift()?.();
    await Promise.resolve();
  };

  const setModes = (next: number): void => {
    modes = next;
  };

  return {
    input,
    sent,
    commands,
    actions,
    scrolls,
    answer,
    setModes,
    mode: () => mode,
    detaches: () => detaches,
  };
};

const lone = { kind: 'key', raw: '\x1b', escapeSent: false } as const;
const arrow = { kind: 'key', raw: '\x1b[A', escapeSent: true } as const;
const split = { kind: 'paste', bytes: encoder.encode('hi'), escapeSent: true } as const;

it('drops the sent Escape from a split arrow when the Escape reached the pane', () => {
  const { input, sent } = router('insert', ModeFlag.applicationCursorKeys);

  input(lone);
  input(arrow);

  expect(sent).toEqual(['\x1b', 'OA']);
});

it('sends the whole split arrow when normal mode consumed the Escape', () => {
  const { input, sent, mode } = router('normal', ModeFlag.applicationCursorKeys);

  input(lone);
  input(arrow);

  expect(sent).toEqual(['\x1bOA']);
  expect(mode()).toBe('insert');
});

it('drops the sent Escape from a split paste only when the Escape reached the pane', () => {
  const inserted = router('insert', ModeFlag.bracketedPaste);

  inserted.input(lone);
  inserted.input(split);

  expect(inserted.sent).toEqual(['\x1b', '[200~hi\x1b[201~']);

  const normal = router('normal', ModeFlag.bracketedPaste);

  normal.input(lone);
  normal.input(split);

  expect(normal.sent).toEqual(['\x1b[200~hi\x1b[201~']);
});

it('detaches once when d follows Ctrl+B and not when d is typed in insert mode', () => {
  const { input, detaches } = router('insert', 0);

  const press = (raw: string) => {
    input({ kind: 'key', raw, escapeSent: false });
  };

  press('d');

  expect(detaches()).toBe(0);

  press('\x02');
  press('d');

  expect(detaches()).toBe(1);
});

const presser = (input: ReturnType<typeof router>['input']) => (raw: string) => {
  input({ kind: 'key', raw, escapeSent: false });
};

it('hands scroll actions to the host and returns to normal mode on Ctrl+B', () => {
  const { input, scrolls, sent, mode } = router('normal', 0);
  const press = presser(input);

  press('[');
  press('g');
  press('\x02');

  expect(scrolls).toEqual([
    { kind: 'enter' },
    { kind: 'move', motion: 'historyTop' },
    { kind: 'leave' },
  ]);

  expect(mode()).toBe('normal');

  press('\x02');

  expect(sent).toEqual(['\x02']);
  expect(mode()).toBe('insert');
});

it('leaves scroll mode for insert mode on q and sends nothing to the pane', () => {
  const { input, scrolls, sent, mode } = router('normal', 0);
  const press = presser(input);

  press('[');
  press('q');
  press('x');

  expect(scrolls).toEqual([{ kind: 'enter' }, { kind: 'leave' }]);
  expect(mode()).toBe('insert');
  expect(sent).toEqual(['x']);
});

it('focuses the next workspace on j in normal mode, sends no bytes, and keeps normal mode', () => {
  const { input, sent, commands, mode } = router('normal', 0);

  presser(input)('j');

  expect(commands).toEqual([{ action: 'focus', workspaceId: secondWorkspace }]);
  expect(sent).toEqual([]);
  expect(mode()).toBe('normal');
});

it('focuses the previous workspace on k and wraps at both ends', () => {
  const first = router('normal', 0);

  presser(first.input)('k');

  expect(first.commands).toEqual([{ action: 'focus', workspaceId: secondWorkspace }]);

  const last = router('normal', 0, secondWorkspace);
  const press = presser(last.input);

  press('j');
  press('k');

  expect(last.commands).toEqual([
    { action: 'focus', workspaceId: firstWorkspace },
    { action: 'focus', workspaceId: secondWorkspace },
  ]);

  expect(last.sent).toEqual([]);
  expect(last.mode()).toBe('normal');
});

it('creates a workspace at the start directory on c without a label', () => {
  const { input, sent, commands, mode } = router('normal', 0);

  presser(input)('c');

  expect(commands).toEqual([
    { action: 'create', root: '/work/start', label: undefined, focus: true },
  ]);

  expect(sent).toEqual([]);
  expect(mode()).toBe('normal');
});

it('closes the focused workspace on X', () => {
  const { input, sent, commands, mode } = router('normal', 0, secondWorkspace);

  presser(input)('X');

  expect(commands).toEqual([{ action: 'close', workspaceId: secondWorkspace }]);
  expect(sent).toEqual([]);
  expect(mode()).toBe('normal');
});

it('does nothing on j, k, and X when no workspace is focused', () => {
  const { input, sent, commands, mode } = router('normal', 0, 'none');
  const press = presser(input);

  press('j');
  press('k');
  press('X');

  expect(commands).toEqual([]);
  expect(sent).toEqual([]);
  expect(mode()).toBe('normal');
});

it('sends j, k, c, and X to the pane in insert mode', () => {
  const { input, sent, commands } = router('insert', 0);
  const press = presser(input);

  press('j');
  press('k');
  press('c');
  press('X');

  expect(sent).toEqual(['j', 'k', 'c', 'X']);
  expect(commands).toEqual([]);
});

const chunkRouter = () => {
  const one = workspaceId(1);
  const two = workspaceId(2);
  const three = workspaceId(3);
  let workspaceIds = [one, two, three];
  let focused: WorkspaceId | undefined = one;
  const commands: WorkspaceCommand[] = [];
  const replies: (() => void)[] = [];
  const failures: (() => void)[] = [];
  const sent: string[] = [];

  const input = createInputRouter({
    mode: () => 'normal',
    setMode: () => undefined,
    modes: () => 0,
    send: (bytes) => {
      if (bytes.length > 0) {
        sent.push(decoder.decode(bytes));
      }
    },
    mouseTarget: () => undefined,
    focusedPane: () => undefined,
    chromeAt: () => undefined,
    focusPane: () => Promise.resolve(),
    paneModes: () => 0,
    paneSize: () => ({ columns: 80, rows: 24 }),
    sendToPane: () => undefined,
    detach: () => undefined,
    tab: () => undefined,
    tabPending: () => false,
    afterTabAnswer: () => undefined,
    workspaces: () => ({ ids: workspaceIds, focused }),
    paneAction: () => Promise.resolve(),
    scroll: () => undefined,
    startDirectory: '/work/start',
    command: (command, onReply) => {
      commands.push(command);

      replies.push(() => {
        onReply('done');
      });

      failures.push(() => {
        onReply('failed');
      });
    },
  });

  const press = presser(input);

  return {
    press,
    commands,
    replies,
    failures,
    sent,
    one,
    two,
    three,
    snapshotChanges: (next: { ids?: WorkspaceId[]; focused: WorkspaceId | undefined }) => {
      workspaceIds = next.ids ?? workspaceIds;
      focused = next.focused;
    },
  };
};

it('focuses two workspaces ahead when j is pressed twice before the snapshot changes', () => {
  const { press, commands, two, three } = chunkRouter();

  press('j');
  press('j');

  expect(commands).toEqual([
    { action: 'focus', workspaceId: two },
    { action: 'focus', workspaceId: three },
  ]);
});

it('closes the workspace that j moved to when X follows j before the snapshot changes', () => {
  const { press, commands, two } = chunkRouter();

  press('j');
  press('X');

  expect(commands).toEqual([
    { action: 'focus', workspaceId: two },
    { action: 'close', workspaceId: two },
  ]);
});

it('resolves from the snapshot focus once the reply to the focus request arrived', () => {
  const { press, commands, replies, snapshotChanges, one, three } = chunkRouter();

  press('j');
  snapshotChanges({ focused: three });
  replies[0]?.();
  press('j');

  expect(commands.at(-1)).toEqual({ action: 'focus', workspaceId: one });
});

it('keeps the pending focus until the reply to the latest focus request arrives', () => {
  const { press, commands, replies, two } = chunkRouter();

  press('j');
  press('j');
  replies[0]?.();
  press('k');

  expect(commands.at(-1)).toEqual({ action: 'focus', workspaceId: two });
});

it('drops the pending focus when its workspace leaves the list', () => {
  const { press, commands, snapshotChanges, one, three } = chunkRouter();

  press('j');
  snapshotChanges({ ids: [one, three], focused: one });
  press('j');

  expect(commands.at(-1)).toEqual({ action: 'focus', workspaceId: three });
});

it('creates a workspace on c after X found nothing to close', () => {
  const { press, commands, snapshotChanges } = chunkRouter();

  snapshotChanges({ ids: [], focused: undefined });
  press('X');
  press('c');

  expect(commands).toEqual([
    { action: 'create', root: '/work/start', label: undefined, focus: true },
  ]);
});

it.each(['c', 'X'])('ignores workspace keys after %s until its reply arrives', (first) => {
  const { press, commands, sent, replies, two } = chunkRouter();

  press(first);

  const issued = commands.length;

  press('j');
  press('k');
  press('X');
  press('c');

  expect(commands).toHaveLength(issued);
  expect(sent).toEqual([]);

  replies[0]?.();
  press('j');

  expect(commands.at(-1)).toEqual({ action: 'focus', workspaceId: two });
});

it('accepts workspace keys again after a create fails', () => {
  const { press, commands, failures, two } = chunkRouter();

  press('c');
  press('j');

  expect(commands).toHaveLength(1);

  failures[0]?.();
  press('j');

  expect(commands.at(-1)).toEqual({ action: 'focus', workspaceId: two });
});

it('routes t to a new tab and sends nothing to the pane', () => {
  expect(routeKey('t', 'normal', 0)).toEqual({
    bytes: new Uint8Array(),
    mode: 'normal',
    detach: false,
    tab: { kind: 'create' },
  });
});

it('routes H and L to the previous and next tab', () => {
  expect(routeKey('H', 'normal', 0).tab).toEqual({ kind: 'previous' });
  expect(routeKey('L', 'normal', 0).tab).toEqual({ kind: 'next' });
  expect(routeKey('L', 'normal', 0).bytes).toEqual(new Uint8Array());
});

it('routes 1 to 9 to a tab by number and leaves 0 alone', () => {
  for (let number = 1; number <= 9; number += 1) {
    const routed = routeKey(String(number), 'normal', 0);

    expect(routed.tab).toEqual({ kind: 'number', number });
    expect(routed.bytes).toEqual(new Uint8Array());
  }

  expect(routeKey('0', 'normal', 0).tab).toBeUndefined();
});

it('sends t, H, L, and digits to the pane in insert mode', () => {
  for (const raw of ['t', 'H', 'L', '3']) {
    expect(routeKey(raw, 'insert', 0)).toEqual({
      bytes: encoder.encode(raw),
      mode: 'insert',
      detach: false,
    });
  }
});

it('asks the host for a tab and keeps normal mode', () => {
  const routes: unknown[] = [];
  const modes: string[] = [];

  const route = createInputRouter({
    mode: () => 'normal',
    setMode: (mode) => modes.push(mode),
    modes: () => 0,
    send: () => undefined,
    mouseTarget: () => undefined,
    focusedPane: () => undefined,
    chromeAt: () => undefined,
    focusPane: () => Promise.resolve(),
    paneModes: () => 0,
    paneSize: () => ({ columns: 80, rows: 24 }),
    sendToPane: () => undefined,
    detach: () => undefined,
    tab: (tab) => routes.push(tab),
    tabPending: () => false,
    afterTabAnswer: () => undefined,
    workspaces: () => ({ ids: [], focused: undefined }),
    paneAction: () => Promise.resolve(),
    scroll: () => undefined,
    startDirectory: '/work/start',
    command: () => undefined,
  });

  route({ kind: 'key', raw: '2', escapeSent: false });

  expect(routes).toEqual([{ kind: 'number', number: 2 }]);
  expect(modes).toEqual(['normal']);
});

it('holds input while a tab request is unanswered and routes it in order after the answer', () => {
  const events: string[] = [];
  let pending = false;
  let answered: (() => void) | undefined;

  let mode: InputMode = 'insert';

  const routeMode = createInputRouter({
    mode: () => mode,
    setMode: (next) => {
      mode = next;
    },
    modes: () => 0,
    send: (bytes) => {
      if (bytes.length > 0) {
        events.push(`send ${decoder.decode(bytes)}`);
      }
    },
    mouseTarget: () => undefined,
    focusedPane: () => undefined,
    chromeAt: () => undefined,
    focusPane: () => Promise.resolve(),
    paneModes: () => 0,
    paneSize: () => ({ columns: 80, rows: 24 }),
    sendToPane: () => undefined,
    detach: () => undefined,
    tab: () => {
      pending = true;
      events.push('tab');
    },
    tabPending: () => pending,
    afterTabAnswer: (callback) => {
      answered = callback;
    },
    workspaces: () => ({ ids: [], focused: undefined }),
    paneAction: () => Promise.resolve(),
    scroll: () => undefined,
    startDirectory: '/work/start',
    command: () => undefined,
  });

  for (const raw of ['\x02', 'L', 'i', 'a', '\x02', 'L', 'i', 'b']) {
    routeMode({ kind: 'key', raw, escapeSent: false });
  }

  expect(events).toEqual(['tab']);

  pending = false;
  answered?.();

  expect(events).toEqual(['tab', 'send a', 'tab']);

  pending = false;
  answered?.();

  expect(events).toEqual(['tab', 'send a', 'tab', 'send b']);
});

const paneKeys: [string, PaneAction][] = [
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
  ['!', 'breakPane'],
];

for (const [raw, action] of paneKeys) {
  it(`asks for ${action} on ${raw} in normal mode, sends no bytes, and stays in normal mode`, () => {
    const { input, sent, actions, mode } = router('insert', 0);

    input({ kind: 'key', raw: '\x02', escapeSent: false });
    input({ kind: 'key', raw, escapeSent: false });

    expect(actions).toEqual([action]);
    expect(sent).toEqual([]);
    expect(mode()).toBe('normal');
  });

  it(`sends ${raw} to the pane in insert mode without a pane action`, () => {
    const { input, sent, actions } = router('insert', 0);

    input({ kind: 'key', raw, escapeSent: false });

    expect(actions).toEqual([]);
    expect(sent).toEqual([raw]);
  });
}

it('holds the tokens after a pane action until its answer arrives, then sends them in order', async () => {
  const { input, sent, actions, answer } = router('insert', 0);

  const press = (raw: string) => {
    input({ kind: 'key', raw, escapeSent: false });
  };

  press('\x02');
  press('h');
  press('i');
  press('a');
  press('b');

  expect(actions).toEqual(['focusPrevious']);
  expect(sent).toEqual([]);

  await answer();

  expect(sent).toEqual(['a', 'b']);
});

it('holds the tokens that follow a second pane action until that action is answered', async () => {
  const { input, sent, actions, answer } = router('insert', 0);

  const press = (raw: string) => {
    input({ kind: 'key', raw, escapeSent: false });
  };

  for (const raw of ['\x02', 'l', 's', 'i', 'z']) {
    press(raw);
  }

  await answer();

  expect(actions).toEqual(['focusNext', 'splitBelow']);
  expect(sent).toEqual([]);

  await answer();

  expect(sent).toEqual(['z']);
});

it('sends held tokens when the action fails to settle normally', async () => {
  const held: string[] = [];
  let mode: InputMode = 'insert';

  const input = createInputRouter({
    mode: () => mode,
    setMode: (next) => {
      mode = next;
    },
    modes: () => 0,
    send: (bytes) => {
      if (bytes.length > 0) {
        held.push(decoder.decode(bytes));
      }
    },
    mouseTarget: () => undefined,
    focusedPane: () => undefined,
    chromeAt: () => undefined,
    focusPane: () => Promise.resolve(),
    paneModes: () => 0,
    paneSize: () => ({ columns: 80, rows: 24 }),
    sendToPane: () => undefined,
    detach: () => undefined,
    tab: () => undefined,
    tabPending: () => false,
    afterTabAnswer: () => undefined,
    workspaces: () => ({ ids: [], focused: undefined }),
    startDirectory: '/work/start',
    command: () => undefined,
    paneAction: () => Promise.reject(new Error('lost')),
    scroll: () => undefined,
  });

  input({ kind: 'key', raw: '\x02', escapeSent: false });
  input({ kind: 'key', raw: 'x', escapeSent: false });
  input({ kind: 'key', raw: 'i', escapeSent: false });
  input({ kind: 'key', raw: 'q', escapeSent: false });
  await Promise.resolve();
  await Promise.resolve();

  expect(held).toEqual(['q']);
});

const withKittyFlags = (flags: number, modes = 0) => modes | (flags << 9);

it('enters normal mode on kitty Ctrl+B and sends nothing, whatever flags the pane asked for', () => {
  for (const flags of [0, 1, 31]) {
    expect(key('\x1b[98;5u', 'insert', withKittyFlags(flags))).toEqual({
      text: '',
      mode: 'normal',
    });
  }
});

it('reads normal-mode keys from kitty input', () => {
  const modes = withKittyFlags(31);

  expect(routeKey('\x1b[105u', 'normal', modes).mode).toBe('insert');
  expect(routeKey('\x1b[27u', 'normal', modes).mode).toBe('insert');
  expect(routeKey('\x1b[100u', 'normal', modes).detach).toBe(true);
  expect(routeKey('\x1b[104;2:1;72u', 'normal', modes).tab).toEqual({ kind: 'previous' });
  expect(routeKey('\x1b[104;5u', 'normal', modes).tab).toBeUndefined();
  expect(routeKey('\x1b[108;2;76u', 'normal', modes).tab).toEqual({ kind: 'next' });
  expect(routeKey('\x1b[115u', 'normal', modes).paneAction).toBe('splitBelow');
});

it('ignores a kitty release in normal mode', () => {
  const routed = routeKey('\x1b[100;1:3u', 'normal', withKittyFlags(3));

  expect(routed).toEqual({ bytes: new Uint8Array(), mode: 'normal', detach: false });
});

it('sends a kitty release to a pane with event types, and not to one without', () => {
  expect(key('\x1b[97;1:3u', 'insert', withKittyFlags(3))).toEqual({
    text: '\x1b[97;1:3u',
    mode: 'insert',
  });

  expect(key('\x1b[97;1:3u', 'insert', withKittyFlags(1)).text).toBe('');
});

it('sends a literal kitty Ctrl+B in the pane encoding after Ctrl+B Ctrl+B', () => {
  const modes = withKittyFlags(1);
  const first = key('\x1b[98;5u', 'insert', modes);
  const second = key('\x1b[98;5u', first.mode, modes);

  expect(second).toEqual({ text: '\x1b[98;5u', mode: 'insert' });
});

it('keeps normal mode and sends nothing while Ctrl+B is held and released', () => {
  for (const flags of [0, 3, 31]) {
    const { input, sent, mode } = router('insert', withKittyFlags(flags));

    input({ kind: 'key', raw: '\x1b[98;5u', escapeSent: false });
    input({ kind: 'key', raw: '\x1b[98;5:2u', escapeSent: false });
    input({ kind: 'key', raw: '\x1b[98;5:2u', escapeSent: false });
    input({ kind: 'key', raw: '\x1b[98;5:3u', escapeSent: false });

    expect(mode()).toBe('normal');
    expect(sent).toEqual([]);
  }
});

it('does not send the release of a key that Koja took to the pane', () => {
  const { input, sent, mode } = router('normal', withKittyFlags(31));

  input({ kind: 'key', raw: '\x1b[105u', escapeSent: false });
  input({ kind: 'key', raw: '\x1b[105;1:3u', escapeSent: false });

  expect(mode()).toBe('insert');
  expect(sent).toEqual([]);
});

const splitUpArrow = (flags: number, flagsAfterEscape = flags) => {
  const { input, sent, setModes } = router('insert', flags << 9);
  const tokenizer = createInputTokenizer();

  for (const token of tokenizer.push(encoder.encode('\x1b'), 0)) {
    if (token.kind === 'key') {
      input(token);
    }
  }

  setModes(flagsAfterEscape << 9);

  for (const token of tokenizer.push(encoder.encode('[A'), 10)) {
    if (token.kind === 'key') {
      input(token);
    }
  }

  return sent.join('');
};

it('sends one Up arrow when a legacy Escape and its continuation arrive in two reads', () => {
  expect(splitUpArrow(0)).toBe('\x1b[A');
  expect(splitUpArrow(1)).toBe('\x1b[27u\x1b[A');
  expect(splitUpArrow(31)).toBe('\x1b[27u\x1b[A');
  expect(splitUpArrow(0, 1)).toBe('\x1b[A');
});

it('ignores Alt keys in normal mode, in legacy and kitty form', () => {
  const ignored = { bytes: new Uint8Array(), mode: 'normal' as const, detach: false };

  for (const raw of [
    '\x1bx',
    '\x1bd',
    '\x1bX',
    '\x1bi',
    '\x1b[120;3u',
    '\x1b[100;3u',
    '\x1b[120;4u',
  ]) {
    expect(routeKey(raw, 'normal', 0)).toEqual(ignored);
    expect(routeKey(raw, 'normal', 31 << 9)).toEqual(ignored);
  }
});

it('still sends an Alt key to the pane in insert mode', () => {
  expect(key('\x1bx', 'insert')).toEqual({ text: '\x1bx', mode: 'insert' });
});

const goneNone = (): GonePanes => ({
  unplaced: new Set(),
  missing: new Set(),
  sizes: new Map(),
});

const mouseRouter = (tabPending: () => boolean = () => false, gone: GonePanes = goneNone()) => {
  const sent: { pane: PaneId; text: string }[] = [];
  let answered: (() => void) | undefined;
  const focused: PaneId[] = [];
  const keys: string[] = [];
  const focusGate: { current: Promise<undefined> } = { current: Promise.resolve(undefined) };
  const tabs: TabRoute[] = [];
  const commands: WorkspaceCommand[] = [];
  let mode: InputMode = 'insert';

  const input = createInputRouter({
    mode: () => mode,
    setMode: (next) => {
      mode = next;
    },
    modes: () => 0,
    send: (bytes) => {
      keys.push(decoder.decode(bytes));
    },
    // Pane 1 holds columns 0 to 9 and pane 2 holds columns 10 to 19. A pointer outside hits nothing.
    mouseTarget: (x, y, pane) => {
      if (pane !== undefined) {
        if (gone.unplaced.has(pane)) {
          return undefined;
        }

        return {
          paneId: pane,
          column: Math.min(Math.max(x - (pane === paneId(2) ? 10 : 0), 0), 9),
          row: y,
        };
      }

      if (x < 0 || x > 19) {
        return undefined;
      }

      return { paneId: paneId(x < 10 ? 1 : 2), column: x % 10, row: y };
    },
    focusedPane: () => paneId(1),
    // Side list row at columns 50 to 59 and a tab label at columns 60 to 69.
    chromeAt: (x) => {
      if (x >= 60 && x < 70) {
        return { kind: 'tab', number: 2 };
      }

      return x >= 50 && x < 60 ? { kind: 'workspace', workspaceId: workspaceId(7) } : undefined;
    },
    focusPane: (pane) => {
      focused.push(pane);

      return focusGate.current;
    },
    paneModes: (pane) => (gone.missing.has(pane) ? 0 : ModeFlag.buttonMouse | ModeFlag.sgrMouse),
    paneSize: (pane) =>
      gone.missing.has(pane) ? undefined : (gone.sizes.get(pane) ?? { columns: 10, rows: 100 }),
    sendToPane: (pane, bytes) => {
      sent.push({ pane, text: decoder.decode(bytes) });
    },
    tab: (route) => {
      tabs.push(route);
    },
    tabPending,
    afterTabAnswer: (callback) => {
      answered = callback;
    },
    detach: () => undefined,
    workspaces: () => ({ ids: [], focused: undefined }),
    startDirectory: '/work/start',
    command: (command) => {
      commands.push(command);
    },
    paneAction: () => Promise.resolve(),
    scroll: () => undefined,
  });

  const mouse = (code: number, column: number, row: number, final: 'M' | 'm') => {
    input({ kind: 'mouse', raw: `\x1b[<${code};${column};${row}${final}`, escapeSent: false });
  };

  return {
    sent,
    keys,
    focusGate,
    focused,
    tabs,
    commands,
    mouse,
    mode: () => mode,
    input,
    answer: () => answered?.(),
  };
};

it('sends a drag and the release to the pane where the press started', () => {
  const { sent, mouse } = mouseRouter();

  mouse(0, 6, 3, 'M');
  mouse(32, 16, 3, 'M');
  mouse(0, 16, 3, 'm');

  expect(sent).toEqual([
    { pane: paneId(1), text: '\x1b[<0;6;3M' },
    { pane: paneId(1), text: '\x1b[<32;10;3M' },
    { pane: paneId(1), text: '\x1b[<0;10;3m' },
  ]);
});

it('sends a click to the pane under the pointer after a release', () => {
  const { sent, mouse } = mouseRouter();

  mouse(0, 6, 3, 'M');
  mouse(0, 6, 3, 'm');
  mouse(0, 16, 3, 'M');

  expect(sent.map((entry) => entry.pane)).toEqual([paneId(1), paneId(1), paneId(2)]);
});

it('sends nothing for a press outside every pane or the drag that follows it', () => {
  const { sent, mouse } = mouseRouter();

  mouse(0, 40, 3, 'M');
  mouse(32, 6, 3, 'M');
  mouse(0, 6, 3, 'm');

  expect(sent).toEqual([]);
});

it('keeps the input mode and the key order when a mouse report arrives between keys', () => {
  const { sent, mouse, mode, input } = mouseRouter();

  input({ kind: 'key', raw: '\x02', escapeSent: false });
  mouse(0, 6, 3, 'M');

  expect(mode()).toBe('normal');
  expect(sent.map((entry) => entry.pane)).toEqual([paneId(1)]);
});

it('keeps the first press capture while another button presses and releases elsewhere', () => {
  const { sent, mouse } = mouseRouter();

  mouse(0, 6, 3, 'M');
  mouse(2, 16, 3, 'M');
  mouse(2, 16, 3, 'm');
  mouse(0, 16, 3, 'm');

  expect(sent).toEqual([
    { pane: paneId(1), text: '\x1b[<0;6;3M' },
    { pane: paneId(1), text: '\x1b[<0;10;3m' },
  ]);
});

it('captures a new press after the release of the first', () => {
  const { sent, mouse } = mouseRouter();

  mouse(0, 6, 3, 'M');
  mouse(0, 6, 3, 'm');
  mouse(2, 16, 3, 'M');
  mouse(2, 16, 3, 'm');

  expect(sent.map((entry) => entry.pane)).toEqual([paneId(1), paneId(1), paneId(2), paneId(2)]);
});

it('sends the release to the captured pane at its last cell once the pane is not placed', () => {
  const gone = goneNone();
  const { sent, mouse } = mouseRouter(undefined, gone);

  mouse(0, 6, 3, 'M');
  mouse(32, 8, 4, 'M');
  gone.unplaced.add(paneId(1));
  mouse(32, 16, 5, 'M');
  mouse(0, 16, 5, 'm');

  expect(sent).toEqual([
    { pane: paneId(1), text: '\x1b[<0;6;3M' },
    { pane: paneId(1), text: '\x1b[<32;8;4M' },
    { pane: paneId(1), text: '\x1b[<0;8;4m' },
  ]);
});

it('sends nothing and clears the capture when the captured pane no longer exists', () => {
  const gone = goneNone();
  const { sent, mouse } = mouseRouter(undefined, gone);

  mouse(0, 6, 3, 'M');
  gone.unplaced.add(paneId(1));
  gone.missing.add(paneId(1));
  mouse(0, 6, 3, 'm');
  mouse(0, 16, 3, 'M');

  expect(sent.map((entry) => entry.pane)).toEqual([paneId(1), paneId(2)]);
});

it('keeps the release for the captured pane when a wheel turns over another pane', () => {
  const gone = goneNone();
  const { sent, mouse } = mouseRouter(undefined, gone);

  mouse(0, 6, 3, 'M');
  mouse(64, 16, 4, 'M');
  gone.unplaced.add(paneId(1));
  mouse(0, 16, 4, 'm');

  expect(sent.filter((entry) => entry.text.endsWith('m'))).toEqual([
    { pane: paneId(1), text: '\x1b[<0;6;3m' },
  ]);
});

it('clamps the release cell to the size the hidden pane has now', () => {
  const gone = goneNone();
  const { sent, mouse } = mouseRouter(undefined, gone);

  mouse(0, 9, 8, 'M');
  gone.unplaced.add(paneId(1));
  gone.sizes.set(paneId(1), { columns: 4, rows: 5 });
  mouse(0, 16, 4, 'm');

  expect(sent.at(-1)).toEqual({ pane: paneId(1), text: '\x1b[<0;4;5m' });
});

it('uses the current placement when the captured pane is placed again before the release', () => {
  const gone = goneNone();
  const { sent, mouse } = mouseRouter(undefined, gone);

  mouse(0, 9, 8, 'M');
  gone.unplaced.add(paneId(1));
  mouse(32, 16, 4, 'M');
  gone.unplaced.delete(paneId(1));
  mouse(0, 3, 6, 'm');

  expect(sent.map((entry) => entry.text)).toEqual(['\x1b[<0;9;8M', '\x1b[<0;3;6m']);
});

it('holds a mouse token behind a pending tab request until the answer arrives', () => {
  let pending = false;
  const { sent, mouse, answer } = mouseRouter(() => pending);

  pending = true;
  mouse(0, 6, 3, 'M');

  expect(sent).toEqual([]);

  pending = false;
  answer();

  expect(sent).toEqual([{ pane: paneId(1), text: '\x1b[<0;6;3M' }]);
});

const nextTick = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

it('focuses an unfocused pane on a left press and sends it the press', async () => {
  const { sent, focused, mouse } = mouseRouter();

  mouse(0, 16, 3, 'M');
  mouse(32, 17, 3, 'M');
  mouse(0, 17, 3, 'm');
  await nextTick();

  expect(focused).toEqual([paneId(2)]);
  expect(sent.map((entry) => entry.pane)).toEqual([paneId(2), paneId(2), paneId(2)]);
});

it('does not focus the focused pane, or a pane on a right press, a drag, or a wheel', () => {
  const { focused, mouse } = mouseRouter();

  mouse(0, 6, 3, 'M');
  mouse(0, 6, 3, 'm');
  mouse(2, 16, 3, 'M');
  mouse(2, 16, 3, 'm');
  mouse(65, 16, 3, 'M');

  expect(focused).toEqual([]);
});

it('focuses a workspace on a left press over it', () => {
  const { commands, focused, mouse } = mouseRouter();

  mouse(0, 56, 3, 'M');
  mouse(0, 56, 3, 'm');

  expect(commands).toEqual([{ action: 'focus', workspaceId: workspaceId(7) }]);
  expect(focused).toEqual([]);
});

it('focuses a tab by number on a left press over its label', () => {
  const { commands, tabs, focused, mouse } = mouseRouter();

  mouse(0, 66, 3, 'M');
  mouse(0, 66, 3, 'm');

  expect(tabs).toEqual([{ kind: 'number', number: 2 }]);
  expect(commands).toEqual([]);
  expect(focused).toEqual([]);
});

it('ignores a right press and a drag that starts over a workspace or tab', () => {
  const { commands, tabs, mouse } = mouseRouter();

  mouse(2, 56, 3, 'M');
  mouse(2, 56, 3, 'm');
  mouse(32, 66, 3, 'M');

  expect(commands).toEqual([]);
  expect(tabs).toEqual([]);
});

it('holds a key typed after a focusing click until the focus settles', async () => {
  const { keys, focusGate, mouse, input } = mouseRouter();
  const gate = Promise.withResolvers<undefined>();

  focusGate.current = gate.promise;
  mouse(0, 16, 3, 'M');
  input({ kind: 'key', raw: 'x', escapeSent: false });

  expect(keys).toEqual([]);

  gate.resolve();
  await gate.promise;
  await Promise.resolve();

  expect(keys).toEqual(['x']);
});

it('holds a key typed after a workspace click until the focus reply arrives', () => {
  const replies: (() => void)[] = [];
  const keys: string[] = [];

  const input = createInputRouter({
    mode: () => 'insert',
    setMode: () => undefined,
    modes: () => 0,
    send: (bytes) => {
      keys.push(decoder.decode(bytes));
    },
    mouseTarget: () => undefined,
    focusedPane: () => undefined,
    chromeAt: () => ({ kind: 'workspace', workspaceId: workspaceId(2) }),
    focusPane: () => Promise.resolve(),
    paneModes: () => 0,
    paneSize: () => ({ columns: 80, rows: 24 }),
    sendToPane: () => undefined,
    tab: () => undefined,
    tabPending: () => false,
    afterTabAnswer: () => undefined,
    detach: () => undefined,
    workspaces: () => ({ ids: [workspaceId(1), workspaceId(2)], focused: workspaceId(1) }),
    startDirectory: '/work/start',
    command: (_command, onReply) => {
      replies.push(() => {
        onReply('done');
      });
    },
    paneAction: () => Promise.resolve(),
    scroll: () => undefined,
  });

  input({ kind: 'mouse', raw: '\x1b[<0;6;3M', escapeSent: false });
  input({ kind: 'key', raw: 'x', escapeSent: false });
  input({ kind: 'paste', bytes: new TextEncoder().encode('p'), escapeSent: false });

  expect(keys).toEqual([]);

  replies[0]?.();

  expect(keys).toEqual(['x', 'p']);
});

const harness = (initial: InputMode, overrides: Partial<RouterHost> = {}, initialModes = 0) => {
  let mode = initial;
  let tabIsPending = false;
  const sent: string[] = [];
  const toPane: { pane: PaneId; text: string }[] = [];
  const scrolls: ScrollAction[] = [];
  const tabs: TabRoute[] = [];
  const actions: PaneAction[] = [];
  const paneAnswers: (() => void)[] = [];
  const commands: { command: WorkspaceCommand; reply: () => void }[] = [];
  const tabCallbacks: (() => void)[] = [];

  const input = createInputRouter({
    mode: () => mode,
    setMode: (next) => {
      mode = next;
    },
    modes: () => initialModes,
    send: (bytes) => {
      if (bytes.length > 0) {
        sent.push(decoder.decode(bytes));
      }
    },
    // Pane 1 holds columns 0 to 9 and pane 2 holds columns 10 to 19.
    mouseTarget: (x, y, pane) => {
      const target = pane ?? paneId(x < 10 ? 1 : 2);

      return { paneId: target, column: x % 10, row: y };
    },
    focusedPane: () => paneId(1),
    chromeAt: () => undefined,
    focusPane: () => Promise.resolve(),
    paneModes: () => ModeFlag.buttonMouse | ModeFlag.sgrMouse,
    paneSize: () => ({ columns: 10, rows: 100 }),
    sendToPane: (pane, bytes) => {
      toPane.push({ pane, text: decoder.decode(bytes) });
    },
    detach: () => undefined,
    workspaces: () => ({ ids: [firstWorkspace, secondWorkspace], focused: firstWorkspace }),
    startDirectory: '/work/start',
    command: (command, onReply) => {
      commands.push({
        command,
        reply: () => {
          onReply('done');
        },
      });
    },
    tab: (route) => {
      tabs.push(route);
    },
    tabPending: () => tabIsPending,
    afterTabAnswer: (callback) => {
      tabCallbacks.push(callback);
    },
    paneAction: (action) => {
      actions.push(action);

      return new Promise((resolve) => {
        paneAnswers.push(resolve);
      });
    },
    scroll: (action) => {
      scrolls.push(action);
    },
    ...overrides,
  });

  const press = (raw: string) => {
    input({ kind: 'key', raw, escapeSent: false });
  };

  const mouse = (code: number, column: number, row: number, final: 'M' | 'm') => {
    input({ kind: 'mouse', raw: `\x1b[<${code};${column};${row}${final}`, escapeSent: false });
  };

  const pastes = (text: string) => {
    input({ kind: 'paste', bytes: encoder.encode(text), escapeSent: false });
  };

  const answerTab = () => {
    tabIsPending = false;

    for (const callback of tabCallbacks.splice(0)) {
      callback();
    }
  };

  return {
    input,
    press,
    mouse,
    pastes,
    sent,
    toPane,
    scrolls,
    tabs,
    actions,
    commands,
    mode: () => mode,
    startTab: () => {
      tabIsPending = true;
    },
    answerTab,
    answerPaneAction: async () => {
      paneAnswers.shift()?.();
      await nextTick();
    },
  };
};

it('asks to detach only for d', () => {
  const taken = [
    routeKey('\x02', 'normal', 0),
    routeKey('\x1b[98;5u', 'normal', 0),
    routeKey('j', 'normal', 0),
    routeKey('c', 'normal', 0),
    routeKey('t', 'normal', 0),
    routeKey('s', 'normal', 0),
    routeKey('[', 'normal', 0),
    routeKey('x', 'normal', 0),
    routeKey('\x1b[98;5:2u', 'insert', 0),
    routeKey('\x1b[98;5:2u', 'normal', 0),
  ];

  expect(taken.map((routed) => routed.detach)).toEqual(taken.map(() => false));
});

it('ignores the release of a scroll key', () => {
  for (const raw of ['\x1b[1;1:3A', '\x1b[27;1:3u', '\x1b[113;1:3u']) {
    expect(routeKey(raw, 'scroll', 0)).toEqual({
      bytes: new Uint8Array(),
      mode: 'scroll',
      detach: false,
    });
  }

  expect(routeKey('\x1b[1;1:1A', 'scroll', 0).scroll).toEqual({ kind: 'move', motion: 'up' });
});

it('stays in scroll mode on q with Alt or Ctrl', () => {
  for (const raw of ['\x1b[113;3;113u', '\x1b[113;5;113u', '\x1b[113;9;113u']) {
    const routed = routeKey(raw, 'scroll', 0);

    expect(routed.mode).toBe('scroll');
    expect(routed.scroll).toBeUndefined();
  }
});

it('asks for no tab when the key text is more than one digit', () => {
  expect(routeKey('\x1b[49;1;49:50u', 'normal', 0).tab).toBeUndefined();
  expect(routeKey('\x1b[49;1;49u', 'normal', 0).tab).toEqual({ kind: 'number', number: 1 });
});

it('sends the release of a key to the pane when its press reached the pane', () => {
  const { press, sent } = harness('insert', {}, withKittyFlags(0b1011));

  press('\x1b[97;1:1u');
  press('\x1b[97;1:3u');

  expect(sent).toEqual(['\x1b[97u', '\x1b[97;1:3u']);
});

it('sends the release of a key to the pane after Koja took an earlier press of it', () => {
  const { press, sent, mode } = harness('normal', {}, withKittyFlags(0b1011));

  press('\x1b[105;1:1u');

  expect(mode()).toBe('insert');
  expect(sent).toEqual([]);

  press('\x1b[105;1:1u');
  press('\x1b[105;1:3u');

  expect(sent).toEqual(['\x1b[105u', '\x1b[105;1:3u']);
});

it('sends a wheel to the pane under the pointer during a held button', () => {
  const { mouse, toPane } = harness('insert');

  mouse(0, 6, 3, 'M');
  mouse(65, 16, 3, 'M');

  expect(toPane.map((entry) => entry.pane)).toEqual([paneId(1), paneId(2)]);
});

it('keeps the pressed cell for the release when a wheel turns over the captured pane', () => {
  let unplaced = false;

  const { mouse, toPane } = harness('insert', {
    mouseTarget: (x, y, pane) => {
      if (unplaced) {
        return undefined;
      }

      return { paneId: pane ?? paneId(1), column: x, row: y };
    },
  });

  mouse(0, 6, 3, 'M');
  mouse(65, 2, 9, 'M');
  unplaced = true;
  mouse(0, 6, 3, 'm');

  expect(toPane.at(-1)).toEqual({ pane: paneId(1), text: '\x1b[<0;6;3m' });
});

it('sends nothing to the pane for an event it does not want', () => {
  const { mouse, toPane } = harness('insert');

  mouse(35, 6, 3, 'M');

  expect(toPane).toEqual([]);
});

it('does nothing when the clicked workspace is already shown', () => {
  const clicked = harness('insert', {
    chromeAt: () => ({ kind: 'workspace', workspaceId: firstWorkspace }),
  });

  clicked.mouse(0, 6, 3, 'M');

  expect(clicked.commands).toEqual([]);

  const chosen = harness('normal', {
    chromeAt: () => ({ kind: 'workspace', workspaceId: secondWorkspace }),
  });

  chosen.press('j');
  chosen.mouse(0, 6, 3, 'M');

  expect(chosen.commands.map((entry) => entry.command)).toEqual([
    { action: 'focus', workspaceId: secondWorkspace },
  ]);
});

it('ignores a mouse report with column or row 0', () => {
  const { mouse, toPane, press, sent } = harness('insert');

  mouse(0, 0, 1, 'M');
  mouse(0, 1, 0, 'M');
  press('a');

  expect(toPane).toEqual([]);
  expect(sent).toEqual(['a']);
});

it('sends a paste after a sent Escape without bracketed paste as it is', () => {
  const { input, sent } = harness('insert');

  input(lone);
  input(split);

  expect(sent).toEqual(['\x1b', 'hi']);
});

it('gives the host no scroll action for keys that do not scroll', () => {
  const { press, scrolls } = harness('normal');

  press('j');
  press('i');
  press('a');

  expect(scrolls).toHaveLength(0);
});

it('holds a pane key, a tab key, [, and a mouse token behind a workspace request, not a paste', () => {
  const held = harness('normal');

  held.press('j');
  held.press('s');
  held.press('t');
  held.press('[');
  held.mouse(0, 6, 3, 'M');
  held.pastes('p');

  expect(held.actions).toEqual([]);
  expect(held.tabs).toEqual([]);
  expect(held.scrolls).toEqual([]);
  expect(held.toPane).toEqual([]);
  expect(held.sent).toEqual([]);

  held.commands[0]?.reply();

  expect(held.actions).toEqual(['splitBelow']);
});

it('holds each kind of snapshot token alone behind a workspace request', () => {
  const kinds: [string, (h: ReturnType<typeof harness>) => unknown[]][] = [
    ['s', (h) => h.actions],
    ['t', (h) => h.tabs],
    ['[', (h) => h.scrolls],
  ];

  for (const [raw, observed] of kinds) {
    const { press, commands, ...rest } = harness('normal');

    press('k');
    press(raw);

    expect(observed({ press, commands, ...rest })).toEqual([]);

    commands[0]?.reply();

    expect(observed({ press, commands, ...rest })).toHaveLength(1);
  }

  const mouseHeld = harness('normal');

  mouseHeld.press('j');
  mouseHeld.mouse(0, 6, 3, 'M');

  expect(mouseHeld.toPane).toEqual([]);

  mouseHeld.commands[0]?.reply();

  expect(mouseHeld.toPane).toHaveLength(1);
});

it('passes a paste and a workspace key at once behind a workspace request', () => {
  const { press, pastes, sent, commands } = harness('normal');

  press('j');
  pastes('p');
  press('k');
  press('i');

  expect(sent).toEqual(['p']);
  expect(commands).toHaveLength(2);
});

it('resumes held tokens after the answer to c and to X', () => {
  for (const raw of ['c', 'X']) {
    const { press, commands, actions } = harness('normal');

    press(raw);
    press('s');

    expect(actions).toEqual([]);

    commands[0]?.reply();

    expect(actions).toEqual(['splitBelow']);
  }
});

it('resumes held tokens after each of two workspace answers', async () => {
  const { press, commands, actions, answerPaneAction } = harness('normal');

  press('j');
  press('s');
  commands[0]?.reply();
  await answerPaneAction();
  press('j');
  press('v');
  commands[1]?.reply();

  expect(actions).toEqual(['splitBelow', 'splitRight']);
});

it('lets a key pass at once after a workspace click was answered and j was pressed', () => {
  const { press, mouse, commands, mode } = harness('normal', {
    chromeAt: () => ({ kind: 'workspace', workspaceId: secondWorkspace }),
  });

  mouse(0, 6, 3, 'M');
  commands[0]?.reply();
  press('j');
  press('i');

  expect(mode()).toBe('insert');
});

it('wakes held tokens once after a tab answer', () => {
  const { press, startTab, answerTab, actions } = harness('normal');

  startTab();
  press('s');
  press('v');
  answerTab();

  expect(actions).toEqual(['splitBelow']);
});
