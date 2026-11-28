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

  test('falls back to info for an unknown level', () => {
    const toast = readToastProps({ level: 'loud' });

    expect(toast.level).toBe('info');
  });

  test('drops an action without a name', () => {
    const toast = readToastProps({ action: { args: {} } });

    expect(toast.action).toBeNull();
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
});
