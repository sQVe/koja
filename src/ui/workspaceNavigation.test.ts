import { expect, it } from 'bun:test';

import type { WorkspaceCommand, WorkspaceReply } from '../client/client.ts';
import { workspaceId } from '../ids.ts';
import type { WorkspaceId } from '../ids.ts';
import { createWorkspaceNavigation } from './workspaceNavigation.ts';

const first = workspaceId(1);
const second = workspaceId(2);
const third = workspaceId(3);

const setup = (ids: WorkspaceId[], focused: WorkspaceId | undefined) => {
  const state = { ids, focused };
  const commands: WorkspaceCommand[] = [];
  const replies: ((reply: WorkspaceReply) => void)[] = [];

  const navigation = createWorkspaceNavigation({
    workspaces: () => ({ ids: state.ids, focused: state.focused }),
    startDirectory: '/work',
    command: (command, onReply) => {
      commands.push(command);
      replies.push(onReply);
    },
  });

  return { state, commands, replies, navigation };
};

const answer = (reply: ((reply: WorkspaceReply) => void) | undefined): void => {
  reply?.({} as WorkspaceReply);
};

it('focuses two workspaces ahead when j is pressed twice before an answer', () => {
  const { commands, navigation } = setup([first, second, third], first);

  navigation.runKey('next');
  navigation.runKey('next');

  expect(commands).toEqual([
    { action: 'focus', workspaceId: second },
    { action: 'focus', workspaceId: third },
  ]);

  expect(navigation.pending()).toBe(true);
});

it('closes the pending target when X follows j', () => {
  const { commands, navigation } = setup([first, second, third], first);

  navigation.runKey('next');
  navigation.runKey('close');

  expect(commands[1]).toEqual({ action: 'close', workspaceId: second });
});

it('drops workspace keys after c until its reply', () => {
  const { commands, replies, navigation } = setup([first, second], first);

  navigation.runKey('create');
  navigation.runKey('next');
  navigation.runKey('close');

  expect(commands).toHaveLength(1);
  expect(commands[0]?.action).toBe('create');
  expect(navigation.pending()).toBe(true);

  answer(replies[0]);
  navigation.runKey('next');

  expect(commands).toHaveLength(2);
  expect(navigation.pending()).toBe(true);
});

it('drops workspace keys after X until its reply', () => {
  const { commands, replies, navigation } = setup([first, second], first);

  navigation.runKey('close');
  navigation.runKey('next');

  expect(commands).toEqual([{ action: 'close', workspaceId: first }]);

  answer(replies[0]);

  expect(navigation.pending()).toBe(false);
});

it('drops a pending focus that leaves the list', () => {
  const { state, commands, navigation } = setup([first, second, third], first);

  navigation.runKey('next');
  state.ids = [first, third];
  navigation.runKey('next');

  expect(commands[1]).toEqual({ action: 'focus', workspaceId: third });
});

it('runs afterSettled callbacks once when nothing is pending', () => {
  const { replies, navigation } = setup([first, second, third], first);
  let calls = 0;

  navigation.runKey('next');
  navigation.runKey('next');

  navigation.afterSettled(() => {
    calls += 1;
  });

  answer(replies[0]);

  expect(calls).toBe(0);

  answer(replies[1]);
  navigation.runKey('close');
  answer(replies[2]);

  expect(calls).toBe(1);
  expect(navigation.pending()).toBe(false);
});

it('sets clickFocusing for a click focus until it settles', () => {
  const { commands, replies, navigation } = setup([first, second], first);

  navigation.focusByClick(second);

  expect(commands).toEqual([{ action: 'focus', workspaceId: second }]);
  expect(navigation.clickFocusing()).toBe(true);

  answer(replies[0]);

  expect(navigation.clickFocusing()).toBe(false);
});

it('ignores a click on the workspace already shown', () => {
  const { commands, navigation } = setup([first, second], first);

  navigation.focusByClick(first);

  expect(commands).toEqual([]);
  expect(navigation.clickFocusing()).toBe(false);
});

it('sends nothing for j or k when no workspace is focused', () => {
  const { commands, navigation } = setup([first, second], undefined);

  navigation.runKey('next');
  navigation.runKey('previous');

  expect(commands).toEqual([]);
  expect(navigation.pending()).toBe(false);
});

it('sends nothing for j when the focused workspace is not listed', () => {
  const { commands, navigation } = setup([first, second], third);

  navigation.runKey('next');

  expect(commands).toEqual([]);
  expect(navigation.pending()).toBe(false);
});

it('sends nothing for j when there are no workspaces', () => {
  const { commands, navigation } = setup([], first);

  navigation.runKey('next');

  expect(commands).toEqual([]);
});

it('wraps k from the first workspace to the last', () => {
  const { commands, navigation } = setup([first, second, third], first);

  navigation.runKey('previous');

  expect(commands).toEqual([{ action: 'focus', workspaceId: third }]);
});
