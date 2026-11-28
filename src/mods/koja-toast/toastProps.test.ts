import { describe, expect, test } from 'bun:test';

import { readToastProps } from './toastProps.ts';

describe('toastProps', () => {
  test('reads a machine login body as a login toast', () => {
    const toast = readToastProps({ body: 'devbox needs login; run hc machine login devbox' });

    expect(toast.content).toEqual({
      kind: 'login',
      machine: 'devbox',
      command: 'hc machine login devbox',
    });
  });

  test('keeps a body plain when the run command names another machine', () => {
    const body = 'devbox needs login; run hc machine login otherbox';
    const toast = readToastProps({ title: 'Agent blocked', body });

    expect(toast.content).toEqual({ kind: 'plain', title: 'Agent blocked', body });
  });

  test('reads a machine name with uppercase letters as a login', () => {
    const toast = readToastProps({ body: 'DevBox needs login; run hc machine login DevBox' });

    expect(toast.content).toEqual({
      kind: 'login',
      machine: 'DevBox',
      command: 'hc machine login DevBox',
    });
  });

  test('reads a machine name longer than 32 characters as a login', () => {
    const machine = 'workstation-with-a-very-long-name';

    const toast = readToastProps({
      body: `${machine} needs login; run hc machine login ${machine}`,
    });

    expect(toast.content).toEqual({
      kind: 'login',
      machine,
      command: `hc machine login ${machine}`,
    });
  });

  test('reads a machine name with a space as a login', () => {
    const machine = 'my laptop';

    const toast = readToastProps({
      body: `${machine} needs login; run hc machine login ${machine}`,
    });

    expect(toast.content).toEqual({
      kind: 'login',
      machine,
      command: `hc machine login ${machine}`,
    });
  });

  test('reads a machine name that contains the separator as a login', () => {
    const machine = 'east needs login; run hc machine login west';

    const toast = readToastProps({
      body: `${machine} needs login; run hc machine login ${machine}`,
    });

    expect(toast.content).toEqual({
      kind: 'login',
      machine,
      command: `hc machine login ${machine}`,
    });
  });

  test('keeps a blank machine name as a plain body', () => {
    const body = '  needs login; run hc machine login  ';
    const toast = readToastProps({ title: 'Agent blocked', body });

    expect(toast.content).toEqual({ kind: 'plain', title: 'Agent blocked', body });
  });

  test('reads a login body padded with whitespace as a login toast', () => {
    const toast = readToastProps({ body: ' devbox needs login; run hc machine login devbox\n' });

    expect(toast.content).toEqual({
      kind: 'login',
      machine: 'devbox',
      command: 'hc machine login devbox',
    });
  });

  test('falls back to info for an unknown level', () => {
    const toast = readToastProps({ level: 'loud' });

    expect(toast.level).toBe('info');
  });

  test('drops an action without a name', () => {
    const toast = readToastProps({ action: { args: {} } });

    expect(toast.action).toBeNull();
  });

  test('drops an action with an empty name', () => {
    const toast = readToastProps({ action: { name: '', args: {} } });

    expect(toast.action).toBeNull();
  });

  test('reads an empty icon as absent', () => {
    const toast = readToastProps({ icon: '' });

    expect(toast.icon).toBeNull();
  });

  test('reads an empty body as absent', () => {
    const toast = readToastProps({ body: '' });

    expect(toast.content).toEqual({ kind: 'plain', title: '', body: null });
  });

  test('reads fitHeight only when it is true', () => {
    expect(readToastProps({ fitHeight: true }).fitHeight).toBe(true);
    expect(readToastProps({ fitHeight: 'true' }).fitHeight).toBe(false);
  });

  test('keeps the title of a plain toast', () => {
    const toast = readToastProps({ title: 'Build failed', body: 'typecheck exited with code 1.' });

    expect(toast.content).toEqual({
      kind: 'plain',
      title: 'Build failed',
      body: 'typecheck exited with code 1.',
    });
  });

  test('reads a plain body with an absent title as an empty title', () => {
    const toast = readToastProps({ body: 'typecheck exited with code 1.' });

    expect(toast.content).toEqual({
      kind: 'plain',
      title: '',
      body: 'typecheck exited with code 1.',
    });
  });
});
