import { afterAll, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { click, clickablesWithText, drawnTree } from '../../../tests/drawn.ts';
import { mockGalleryModules } from '../../../tests/gallery.ts';

interface Notification {
  title: string;
  body?: string;
  level?: string;
  timeout?: number;
  action?: { name: string; args?: Record<string, unknown> };
}

const notifications: Notification[] = [];

Object.assign(globalThis, { kojaModName: 'koja' });

const kitFake = await mockGalleryModules({
  notify: (notification: Notification) => {
    notifications.push(notification);

    return 'toast-1';
  },
});

await mock.module('../../kit/index.ts', () => kitFake);

const { toasts } = await import('./toasts.ts');

afterAll(() => {
  mock.restore();
});

test('posts a notification with an action and a timeout', () => {
  const parts = toasts() as unknown as DrawnElement[];
  const [button] = clickablesWithText(drawnTree(parts), 'Post a notification');

  if (button === undefined) {
    throw new Error('The gallery draws no Post a notification button.');
  }

  click(button);

  expect(notifications).toHaveLength(1);
  expect(notifications[0]?.action?.name).toBeTruthy();
  expect(notifications[0]?.timeout ?? 0).toBeGreaterThan(0);
});
