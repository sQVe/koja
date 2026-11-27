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

  test('falls back to info for an unknown level', () => {
    const toast = readToastProps({ level: 'loud' });

    expect(toast.level).toBe('info');
  });

  test('drops an action without a name', () => {
    const toast = readToastProps({ action: { args: {} } });

    expect(toast.action).toBeNull();
  });
});
