import { expect, it } from 'bun:test';

import { paneId, workspaceId } from '../ids.ts';
import {
  createInputHarness,
  firstWorkspace,
  secondWorkspace,
  storeSnapshotOf,
} from './inputFixtures.ts';

const one = workspaceId(1);
const two = workspaceId(2);
const three = workspaceId(3);

const threeWorkspaces = () => {
  const harness = createInputHarness('normal');

  harness.snapshot.ids = [one, two, three];

  return harness;
};

it('focuses the next workspace on j in normal mode, sends no bytes, and keeps normal mode', () => {
  const { press, sent, commands, mode } = createInputHarness('normal');

  press('j');

  expect(commands).toEqual([{ action: 'focus', workspaceId: secondWorkspace }]);
  expect(sent).toEqual([]);
  expect(mode()).toBe('normal');
});

it('focuses the previous workspace on k and wraps at both ends', () => {
  const first = createInputHarness('normal');

  first.press('k');

  expect(first.commands).toEqual([{ action: 'focus', workspaceId: secondWorkspace }]);

  const last = createInputHarness('normal');

  last.snapshot.focused = secondWorkspace;
  last.press('j');
  last.press('k');

  expect(last.commands).toEqual([
    { action: 'focus', workspaceId: firstWorkspace },
    { action: 'focus', workspaceId: secondWorkspace },
  ]);

  expect(last.sent).toEqual([]);
  expect(last.mode()).toBe('normal');
});

it('creates a workspace at the start directory on c without a label', () => {
  const { press, sent, commands, mode } = createInputHarness('normal');

  press('c');

  expect(commands).toEqual([
    { action: 'create', root: '/work/start', label: undefined, focus: true },
  ]);

  expect(sent).toEqual([]);
  expect(mode()).toBe('normal');
});

it('closes the focused workspace on X', () => {
  const { press, sent, commands, mode, snapshot } = createInputHarness('normal');

  snapshot.focused = secondWorkspace;
  press('X');

  expect(commands).toEqual([{ action: 'close', workspaceId: secondWorkspace }]);
  expect(sent).toEqual([]);
  expect(mode()).toBe('normal');
});

it('does nothing on j, k, and X when no workspace is focused', () => {
  const { press, sent, commands, mode, snapshot } = createInputHarness('normal');

  snapshot.focused = undefined;
  press('j');
  press('k');
  press('X');

  expect(commands).toEqual([]);
  expect(sent).toEqual([]);
  expect(mode()).toBe('normal');
});

it('sends j, k, c, and X to the pane in insert mode', () => {
  const { press, sent, commands } = createInputHarness('insert');

  press('j');
  press('k');
  press('c');
  press('X');

  expect(sent).toEqual(['j', 'k', 'c', 'X']);
  expect(commands).toEqual([]);
});

it('focuses two workspaces ahead when j is pressed twice before the snapshot changes', () => {
  const { press, commands } = threeWorkspaces();

  press('j');
  press('j');

  expect(commands).toEqual([
    { action: 'focus', workspaceId: two },
    { action: 'focus', workspaceId: three },
  ]);
});

it('closes the workspace that j moved to when X follows j before the snapshot changes', () => {
  const { press, commands } = threeWorkspaces();

  press('j');
  press('X');

  expect(commands).toEqual([
    { action: 'focus', workspaceId: two },
    { action: 'close', workspaceId: two },
  ]);
});

it('resolves from the snapshot focus once the reply to the focus request arrived', () => {
  const { press, commands, replies, snapshot } = threeWorkspaces();

  press('j');
  snapshot.focused = three;
  replies[0]?.();
  press('j');

  expect(commands.at(-1)).toEqual({ action: 'focus', workspaceId: one });
});

it('keeps the pending focus until the reply to the latest focus request arrives', () => {
  const { press, commands, replies } = threeWorkspaces();

  press('j');
  press('j');
  replies[0]?.();
  press('k');

  expect(commands.at(-1)).toEqual({ action: 'focus', workspaceId: two });
});

it('drops the pending focus when its workspace leaves the list', () => {
  const { press, commands, snapshot } = threeWorkspaces();

  press('j');
  snapshot.ids = [one, three];
  snapshot.focused = one;
  press('j');

  expect(commands.at(-1)).toEqual({ action: 'focus', workspaceId: three });
});

it('creates a workspace on c after X found nothing to close', () => {
  const { press, commands, snapshot } = threeWorkspaces();

  snapshot.ids = [];
  snapshot.focused = undefined;
  press('X');
  press('c');

  expect(commands).toEqual([
    { action: 'create', root: '/work/start', label: undefined, focus: true },
  ]);
});

it.each(['c', 'X'])('ignores workspace keys after %s until its reply arrives', (first) => {
  const { press, commands, sent, replies } = threeWorkspaces();

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
  const { press, commands, failures } = threeWorkspaces();

  press('c');
  press('j');

  expect(commands).toHaveLength(1);

  failures[0]?.();
  press('j');

  expect(commands.at(-1)).toEqual({ action: 'focus', workspaceId: two });
});

it('focuses a workspace on a left press over it', () => {
  const { commands, focused, mouse } = createInputHarness('insert');

  mouse(0, 56, 3, 'M');
  mouse(0, 56, 3, 'm');

  expect(commands).toEqual([{ action: 'focus', workspaceId: workspaceId(7) }]);
  expect(focused).toEqual([]);
});

it('holds a key typed after a workspace click until the focus reply arrives', () => {
  const { sent, mouse, press, pastes, replies } = createInputHarness('insert', {
    chromeAt: () => ({ kind: 'workspace', workspaceId: workspaceId(2) }),
  });

  mouse(0, 6, 3, 'M');
  press('x');
  pastes('p');

  expect(sent).toEqual([]);

  replies[0]?.();

  expect(sent).toEqual(['x', 'p']);
});

it('does nothing when the clicked workspace is already shown', () => {
  const clicked = createInputHarness('insert', {
    chromeAt: () => ({ kind: 'workspace', workspaceId: firstWorkspace }),
  });

  clicked.mouse(0, 6, 3, 'M');

  expect(clicked.commands).toEqual([]);

  const chosen = createInputHarness('normal', {
    chromeAt: () => ({ kind: 'workspace', workspaceId: secondWorkspace }),
  });

  chosen.press('j');
  chosen.mouse(0, 6, 3, 'M');

  expect(chosen.commands).toEqual([{ action: 'focus', workspaceId: secondWorkspace }]);
});

it('holds a pane key, a tab key, [, and a mouse token behind a workspace request, not a paste', () => {
  const held = createInputHarness('normal');

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

  held.replies[0]?.();

  expect(held.actions).toEqual(['splitBelow']);
});

it('holds each kind of snapshot token alone behind a workspace request', () => {
  const kinds: [string, (h: ReturnType<typeof createInputHarness>) => unknown[]][] = [
    ['s', (h) => h.actions],
    ['t', (h) => h.tabs],
    ['[', (h) => h.scrolls],
  ];

  for (const [raw, observed] of kinds) {
    const held = createInputHarness('normal');

    held.press('k');
    held.press(raw);

    expect(observed(held)).toEqual([]);

    held.replies[0]?.();

    expect(observed(held)).toHaveLength(1);
  }

  const mouseHeld = createInputHarness('normal');

  mouseHeld.press('j');
  mouseHeld.mouse(65, 6, 3, 'M');

  expect(mouseHeld.toPane).toEqual([]);

  mouseHeld.replies[0]?.();

  expect(mouseHeld.toPane).toHaveLength(1);
});

it('passes a paste and a workspace key at once behind a workspace request', () => {
  const { press, pastes, sent, commands } = createInputHarness('normal');

  press('j');
  pastes('p');
  press('k');
  press('i');

  expect(sent).toEqual(['p']);
  expect(commands).toHaveLength(2);
});

it('resumes held tokens after the answer to c and to X', () => {
  for (const raw of ['c', 'X']) {
    const { press, replies, actions } = createInputHarness('normal');

    press(raw);
    press('s');

    expect(actions).toEqual([]);

    replies[0]?.();

    expect(actions).toEqual(['splitBelow']);
  }
});

it('resumes held tokens after each of two workspace answers', async () => {
  const { press, replies, actions, answerPaneAction } = createInputHarness('normal');

  press('j');
  press('s');
  replies[0]?.();
  await answerPaneAction();
  press('j');
  press('v');
  replies[1]?.();

  expect(actions).toEqual(['splitBelow', 'splitRight']);
});

it('lets a key pass at once after a workspace click was answered and j was pressed', () => {
  const { press, mouse, replies, mode } = createInputHarness('normal', {
    chromeAt: () => ({ kind: 'workspace', workspaceId: secondWorkspace }),
  });

  mouse(0, 6, 3, 'M');
  replies[0]?.();
  press('j');
  press('i');

  expect(mode()).toBe('insert');
});

const growingWorkspaces = () => {
  const shown = { ids: [firstWorkspace, secondWorkspace], focused: firstWorkspace };

  const tabs = [
    { id: 1, workspaceId: firstWorkspace, panes: [paneId(1)], focused: paneId(1) },
    { id: 2, workspaceId: secondWorkspace, panes: [paneId(2), paneId(3)], focused: paneId(2) },
    { id: 3, workspaceId: secondWorkspace, panes: [paneId(4)], focused: paneId(4) },
  ];

  const harness = createInputHarness('normal', { snapshot: () => storeSnapshotOf(shown, tabs) });

  const answerFocus = (): void => {
    shown.focused = secondWorkspace;
    harness.replies[0]?.();
  };

  return { ...harness, answerFocus };
};

it('runs l after j once the workspace it moved to makes l available', () => {
  const { press, actions, answerFocus } = growingWorkspaces();

  press('j');
  press('l');

  expect(actions).toEqual([]);

  answerFocus();

  expect(actions).toEqual(['focusNext']);
});

it('runs L after j once the workspace it moved to makes L available', () => {
  const { press, tabs, answerFocus } = growingWorkspaces();

  press('j');
  press('L');
  answerFocus();

  expect(tabs).toEqual([{ kind: 'next' }]);
});
