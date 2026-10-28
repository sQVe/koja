import { expect, it, onTestFinished } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { paneId, tabId, workspaceId } from '../src/ids.ts';
import { masterPanes } from '../src/layout.ts';
import type { Layout, TerminalSize } from '../src/layout.ts';
import type { Log } from '../src/server/log.ts';
import type { Server } from '../src/server/server.ts';
import { createSessionWriter } from '../src/server/sessionWriter.ts';
import type { SavedSession } from '../src/store/store.ts';
import { cliTestTimeoutMs } from './cliHarness.ts';
import { build, connect, startSavedServer, temporaryDirectory, waitFor } from './serverHarness.ts';
import type { TestClient } from './serverHarness.ts';

interface PaneReading {
  processId: number;
  size: TerminalSize;
}

const noop = (): void => {};

const log: Log = { debug: noop, info: noop, warn: noop, error: noop };

const order = [paneId(1), paneId(2), paneId(3)];

// Pane 1 is on the right of the tree, so only the master order puts it on the left.
const layout: Layout = {
  kind: 'split',
  direction: 'right',
  ratio: 0.5,
  first: {
    kind: 'split',
    direction: 'below',
    ratio: 0.5,
    first: { kind: 'pane', paneId: paneId(2) },
    second: { kind: 'pane', paneId: paneId(3) },
  },
  second: { kind: 'pane', paneId: paneId(1) },
};

const savedMasterSession = (root: string): SavedSession => ({
  workspaces: [
    { id: workspaceId(1), root, label: 'saved', tabIds: [tabId(1)], activeTabId: tabId(1) },
  ],
  tabs: [
    {
      id: tabId(1),
      workspaceId: workspaceId(1),
      layout,
      arrangement: { choice: 'master', order },
      focusedPaneId: paneId(1),
      zoomedPaneId: undefined,
      label: undefined,
    },
  ],
  panes: order.map((id) => ({ id, tabId: tabId(1), startFolder: undefined })),
  focusedWorkspaceId: workspaceId(1),
  nextWorkspaceNumber: 2,
  nextTabNumber: 2,
  nextPaneNumber: 4,
});

// The terminal size of each master pane for a pane area, in the order of the master tab.
const masterTerminals = (area: TerminalSize): TerminalSize[] => {
  const placed = masterPanes(order, area);

  if (!placed.ok) {
    throw new Error(`The area ${area.columns}x${area.rows} is too small for the master tab.`);
  }

  return order.map((id) => {
    const rectangle = placed.panes.find((known) => known.paneId === id);

    return { columns: rectangle?.terminal.columns ?? 0, rows: rectangle?.terminal.rows ?? 0 };
  });
};

const storedSizes = (server: Server): TerminalSize[] =>
  order.map((id) => {
    const pane = server.snapshot().panes.find((known) => known.id === id);

    return { columns: pane?.size.columns ?? 0, rows: pane?.size.rows ?? 0 };
  });

const sameSizes = (left: TerminalSize[], right: TerminalSize[]): boolean =>
  left.every((size, index) => {
    const expected = right[index];

    return size.columns === expected?.columns && size.rows === expected.rows;
  });

const readingSchema = z.tuple([z.number(), z.number(), z.number()]);

// Has the pane's shell written its reading? The shell ends each reading with a newline.
const isWritten = (path: string): boolean =>
  existsSync(path) && readFileSync(path, 'utf8').endsWith('\n');

// Asks each pane's shell for its process id and its PTY size, through the pane's own input.
const readPanes = async (
  client: TestClient,
  directory: string,
  label: string,
): Promise<PaneReading[]> => {
  const paths = order.map((_, index) => join(directory, `${label}-${index + 1}.txt`));
  const encoder = new TextEncoder();

  order.forEach((_, index) => {
    const command = `echo "$$ $(stty size)" > '${paths[index]}'\n`;

    client.sendInput(index + 1, encoder.encode(command));
  });

  await waitFor(() => paths.every(isWritten));

  return paths.map((path) => {
    const [processId, rows, columns] = readingSchema.parse(
      readFileSync(path, 'utf8').trim().split(' ').map(Number),
    );

    return { processId, size: { columns, rows } };
  });
};

const pidsOf = (readings: PaneReading[]): number[] => readings.map((reading) => reading.processId);

const sizesOf = (readings: PaneReading[]): TerminalSize[] =>
  readings.map((reading) => reading.size);

it(
  'keeps the panes of a master tab running at their rectangle sizes across a resize below its need and back',
  async () => {
    const directory = await temporaryDirectory();

    await createSessionWriter(join(directory, 'session.json'), log, undefined).stopSaving(
      savedMasterSession(directory),
    );

    const { server, socketPath } = await startSavedServer(directory, { PS1: '' });
    const client = await connect(socketPath);

    onTestFinished(() => {
      client.close();
    });

    const fullArea = { columns: 80, rows: 29 };
    const fullTerminals = masterTerminals(fullArea);

    client.send({ type: 'hello', version: build, size: { columns: 100, rows: 30 } });
    await waitFor(() => sameSizes(storedSizes(server), fullTerminals));

    const before = await readPanes(client, directory, 'full');

    expect(sizesOf(before)).toEqual(fullTerminals);

    const small = { columns: 6, rows: 4 };

    client.send({ type: 'resize', size: small });

    await waitFor(() =>
      server
        .snapshot()
        .clients.some(
          (known) => known.size.columns === small.columns && known.size.rows === small.rows,
        ),
    );

    const shrunk = await readPanes(client, directory, 'small');

    expect(server.snapshot().panes.map((pane) => pane.lifecycle)).toEqual([
      'running',
      'running',
      'running',
    ]);

    expect(pidsOf(shrunk)).toEqual(pidsOf(before));
    expect(sizesOf(shrunk)).toEqual(sizesOf(before));

    for (const reading of shrunk) {
      expect(reading.size.columns).toBeGreaterThan(0);
      expect(reading.size.rows).toBeGreaterThan(0);
    }

    client.send({ type: 'resize', size: { columns: 100, rows: 30 } });
    await waitFor(() => sameSizes(storedSizes(server), fullTerminals));

    const restored = await readPanes(client, directory, 'restored');

    expect(pidsOf(restored)).toEqual(pidsOf(before));
    expect(sizesOf(restored)).toEqual(fullTerminals);
  },
  cliTestTimeoutMs,
);
