import { expect, it, onTestFinished } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeControl, parseControl } from '../src/protocol/protocol.ts';
import { readSessionFile } from '../src/server/sessionFile.ts';
import { applyIntent, createState, snapshot } from '../src/store/store.ts';

it.each([
  { name: 'without saved labels', savedLabel: {}, expectedLabel: undefined },
  { name: 'with null saved labels', savedLabel: { label: null }, expectedLabel: undefined },
  { name: 'with named saved labels', savedLabel: { label: 'build' }, expectedLabel: 'build' },
])('restores tabs $name into a valid client snapshot', async ({ savedLabel, expectedLabel }) => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-session-snapshot-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const path = join(directory, 'session.json');

  const saved = {
    version: 1,
    session: {
      workspaces: [
        {
          id: 'workspace-1',
          root: '/work',
          label: 'work',
          tabIds: ['tab-1'],
          activeTabId: 'tab-1',
        },
      ],
      tabs: [
        {
          id: 'tab-1',
          workspaceId: 'workspace-1',
          layout: { kind: 'pane', paneId: 'pane-1' },
          focusedPaneId: 'pane-1',
          zoomedPaneId: null,
          ...savedLabel,
        },
      ],
      panes: [{ id: 'pane-1', tabId: 'tab-1', startFolder: null }],
      focusedWorkspaceId: 'workspace-1',
      nextWorkspaceNumber: 2,
      nextTabNumber: 2,
      nextPaneNumber: 2,
    },
  };

  await writeFile(path, JSON.stringify(saved));

  const loaded = await readSessionFile(path);

  if (loaded.kind !== 'restored') {
    throw new Error(`Expected a restored session, got ${loaded.kind}.`);
  }

  const restored = applyIntent(createState(), { type: 'restoreSession', session: loaded.session });

  expect(restored.kind).toBe('applied');

  const sent = { type: 'snapshot' as const, snapshot: snapshot(restored.state) };
  const received = parseControl(encodeControl(sent));

  expect(received).toStrictEqual({ ok: true, message: sent });
  expect(sent.snapshot.tabs.map((tab) => tab.label)).toEqual([expectedLabel]);
});
