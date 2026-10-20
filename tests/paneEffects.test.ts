import { expect, it, onTestFinished, spyOn } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { invariant } from '../src/invariant.ts';
import type { Log } from '../src/server/log.ts';
import type { PaneEffectContext } from '../src/server/paneEffects.ts';
import { startPane } from '../src/server/paneEffects.ts';
import type { RunningPane } from '../src/server/paneRecord.ts';
import { applyIntent, createState } from '../src/store/store.ts';
import type { Fact, Pane, Theme } from '../src/store/store.ts';
import { Terminal } from '../src/vt/vt.ts';

interface Started {
  context: PaneEffectContext;
  pane: Pane;
  facts: Fact[];
  errors: { message: string; fields: Record<string, unknown> | undefined }[];
}

const size = { columns: 30, rows: 8 };

const noop = (): void => {};

const nextTurn = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

const started = (options: {
  restored?: boolean;
  theme?: Theme;
  environment?: Record<string, string | undefined>;
}): Started => {
  const directory = mkdtempSync(join(tmpdir(), 'koja-pane-effects-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const errors: Started['errors'] = [];

  const log: Log = {
    debug: noop,
    info: noop,
    warn: noop,
    error: (message, fields) => {
      errors.push({ message, fields });
    },
  };

  const created = applyIntent(createState(), {
    type: 'createWorkspace',
    root: directory,
    label: 'test',
    focus: true,
  });

  invariant(created.kind === 'applied', 'The workspace was refused.');

  const attached = applyIntent(created.state, { type: 'attachClient', size });

  invariant(attached.kind === 'applied', 'The client was refused.');

  let current = attached.state;
  const client = current.clients[0];

  invariant(client !== undefined, 'The client is missing.');

  if (options.theme !== undefined) {
    const themed = applyIntent(current, {
      type: 'setClientTheme',
      clientId: client.id,
      theme: options.theme,
    });

    invariant(themed.kind === 'applied', 'The theme was refused.');
    current = themed.state;
  }

  const first = current.panes[0];

  invariant(first !== undefined, 'The pane is missing.');

  const pane: Pane = { ...first, restored: options.restored ?? false };

  const context: PaneEffectContext = {
    options: {
      log,
      environment: options.environment ?? { SHELL: '/bin/sh', PATH: process.env.PATH },
      socketPath: join(directory, 'koja.sock'),
      binaryPath: '/tmp/koja-test',
      version: { version: 'test', ghostty: 'test' },
    },
    state: { ...current, panes: [pane] },
    runtime: { panes: new Map(), clientIds: new Map(), paneScopes: false },
  };

  onTestFinished(() => {
    for (const running of context.runtime.panes.values()) {
      running.runtime[Symbol.dispose]();
    }
  });

  return { context, pane, facts: [], errors };
};

const waitFor = async (condition: () => boolean): Promise<void> => {
  const deadline = performance.now() + 5000;

  while (!condition()) {
    invariant(performance.now() < deadline, 'The condition did not hold in time.');
    await nextTurn();
  }
};

const send = (running: RunningPane | undefined, text: string): void => {
  invariant(running !== undefined, 'The pane has no record.');
  running.runtime.write(new TextEncoder().encode(text));
};

it('records the running pane and reports it started', () => {
  const { context, pane, facts } = started({});

  startPane(context, pane, (fact) => facts.push(fact));

  const running = context.runtime.panes.get(pane.id);

  expect(running?.runtime.generation).toBe(pane.generation);
  expect(running?.publication.pending).toBe(false);
  expect(running?.publication.publisher).toBeDefined();
  expect(facts).toEqual([{ type: 'paneStarted', paneId: pane.id, generation: pane.generation }]);
});

it('reports the exit code of a pane that exits', async () => {
  const { context, pane, facts } = started({});

  startPane(context, pane, (fact) => facts.push(fact));
  send(context.runtime.panes.get(pane.id), 'exit 3\n');

  await waitFor(() => facts.some((fact) => fact.type === 'paneExited'));

  expect(facts.at(-1)).toEqual({
    type: 'paneExited',
    paneId: pane.id,
    generation: pane.generation,
    exitCode: 3,
  });
});

it('gives the new pane the colors the attached client reported', () => {
  const theme = {
    foreground: 0xaa_bb_cc,
    background: 0x11_22_33,
    palette: Array.from({ length: 16 }, (_, index) => index),
  };

  const { context, pane } = started({ theme });

  startPane(context, pane, () => {});

  const running = context.runtime.panes.get(pane.id);

  invariant(running !== undefined, 'The pane has no record.');

  const { reply } = running.runtime.terminal.write(new TextEncoder().encode('\u001B]11;?\u001B\\'));

  expect(new TextDecoder().decode(reply)).toContain('1111/2222/3333');
});

it('fails only a pane whose output handling throws, and reports no exit for it', async () => {
  const { context, pane, facts, errors } = started({});
  const write = Terminal.prototype.write;
  const decoder = new TextDecoder();
  let seen = '';
  let thrown = false;

  const spy = spyOn(Terminal.prototype, 'write').mockImplementation(function throwOnMarker(
    this: Terminal,
    bytes: Uint8Array,
  ) {
    seen += decoder.decode(bytes, { stream: true });

    if (!thrown && seen.includes('boom-marker')) {
      thrown = true;

      throw new Error('marker rejected');
    }

    return write.call(this, bytes);
  });

  onTestFinished(() => {
    spy.mockRestore();
  });

  startPane(context, pane, (fact) => facts.push(fact));

  const running = context.runtime.panes.get(pane.id);

  invariant(running !== undefined, 'The pane has no record.');
  send(running, "printf 'boom-%s\\n' marker\n");

  await waitFor(() => facts.some((fact) => fact.type === 'paneFailed'));

  // The failure released the pane, which ends its shell. The exit handler was attached first, so it
  // has run once this resolves.
  await running.runtime.exited;

  const failure = facts.find((fact) => fact.type === 'paneFailed');

  invariant(failure?.type === 'paneFailed', 'The pane did not fail.');

  expect(facts.filter((fact) => fact.type !== 'paneStarted')).toEqual([failure]);
  expect(failure).toMatchObject({ paneId: pane.id, generation: pane.generation });
  expect(failure.message).toContain('marker rejected');
  expect(context.runtime.panes.has(pane.id)).toBe(false);

  const logged = errors.find((error) => error.fields?.paneId === pane.id);

  expect(logged?.message).not.toBe('');
  expect(logged?.fields?.message).toContain('marker rejected');
});

it('releases a restored pane whose scoped shell cannot execute', async () => {
  const bin = mkdtempSync(join(tmpdir(), 'koja-fake-systemd-'));

  onTestFinished(() => {
    rmSync(bin, { recursive: true, force: true });
  });

  const script = join(bin, 'systemd-run');

  writeFileSync(
    script,
    '#!/bin/sh\ncase "$*" in *"-- true") exit 0;; esac\necho "Failed to execute /missing: No such file"\nexit 1\n',
  );

  chmodSync(script, 0o755);

  const { context, pane, facts } = started({
    restored: true,
    environment: { SHELL: '/bin/sh', PATH: `${bin}:${process.env.PATH}` },
  });

  context.runtime.paneScopes = undefined;
  startPane(context, pane, (fact) => facts.push(fact));

  await waitFor(() => facts.some((fact) => fact.type === 'paneFailedToStart'));

  expect(facts.at(-1)).toMatchObject({
    type: 'paneFailedToStart',
    paneId: pane.id,
    generation: pane.generation,
  });

  expect(context.runtime.panes.has(pane.id)).toBe(false);
});
