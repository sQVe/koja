import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from './ids.ts';

it('gives different pane ids for different numbers', () => {
  expect(paneId(1)).not.toBe(paneId(2));
});

it('gives equal pane ids for the same number', () => {
  expect(paneId(1)).toBe(paneId(1));
});

it('gives different client ids for different numbers', () => {
  expect(clientId(1)).not.toBe(clientId(2));
});

it('gives equal client ids for the same number', () => {
  expect(clientId(1)).toBe(clientId(1));
});

it('gives workspace and tab ids their prefixed form', () => {
  expect(String(workspaceId(3))).toBe('workspace-3');
  expect(String(tabId(4))).toBe('tab-4');
});
