import { expect, it } from 'bun:test';

import type { InputMode, WorkspaceCommand } from '../client/client.ts';
import { workspaceId } from '../ids.ts';
import type { WorkspaceId } from '../ids.ts';
import { ModeFlag } from '../rows/rows.ts';
import { createInputRouter, routeKey, routePaste } from './input.ts';
import type { PaneAction } from './input.ts';

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
  modes: number,
  focusedWorkspace: WorkspaceId | 'none' = firstWorkspace,
) => {
  let mode = initial;
  const sent: string[] = [];
  let detaches = 0;
  const commands: WorkspaceCommand[] = [];
  const actions: PaneAction[] = [];
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

  return { input, sent, commands, actions, answer, mode: () => mode, detaches: () => detaches };
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
    { action: 'create', root: '/work/start', label: undefined, background: false },
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
    detach: () => undefined,
    tab: () => undefined,
    tabPending: () => false,
    afterTabAnswer: () => undefined,
    workspaces: () => ({ ids: workspaceIds, focused }),
    paneAction: () => Promise.resolve(),
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
    { action: 'create', root: '/work/start', label: undefined, background: false },
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
    detach: () => undefined,
    tab: (tab) => routes.push(tab),
    tabPending: () => false,
    afterTabAnswer: () => undefined,
    workspaces: () => ({ ids: [], focused: undefined }),
    paneAction: () => Promise.resolve(),
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
    detach: () => undefined,
    tab: () => undefined,
    tabPending: () => false,
    afterTabAnswer: () => undefined,
    workspaces: () => ({ ids: [], focused: undefined }),
    startDirectory: '/work/start',
    command: () => undefined,
    paneAction: () => Promise.reject(new Error('lost')),
  });

  input({ kind: 'key', raw: '\x02', escapeSent: false });
  input({ kind: 'key', raw: 'x', escapeSent: false });
  input({ kind: 'key', raw: 'i', escapeSent: false });
  input({ kind: 'key', raw: 'q', escapeSent: false });
  await Promise.resolve();
  await Promise.resolve();

  expect(held).toEqual(['q']);
});
