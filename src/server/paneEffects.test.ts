import { expect, it, onTestFinished, spyOn } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { paneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { applyIntent, createState } from '../store/store.ts';
import type { Fact, Pane, Theme } from '../store/store.ts';
import { Terminal } from '../vt/vt.ts';
import type { Log } from './log.ts';
import type { PaneRuntime } from './pane.ts';
import type { PaneEffectContext } from './paneEffects.ts';
import {
  applyThemeToPane,
  findLivePane,
  releasePane,
  removePane,
  resizePane,
  startPane,
  stopPane,
} from './paneEffects.ts';
import type { RunningPane } from './paneRecord.ts';
import type { RowPublisher } from './rowPublisher.ts';

interface Fixture {
  context: PaneEffectContext;
  running: RunningPane;
  disposed: string[];
  errors: string[];
  fields: (Record<string, unknown> | undefined)[];
}

interface Recording {
  context: PaneEffectContext;
  running: RunningPane;
  calls: string[];
  errors: { message: string; fields: Record<string, unknown> | undefined }[];
}

interface Started {
  context: PaneEffectContext;
  pane: Pane;
  facts: Fact[];
  errors: { message: string; fields: Record<string, unknown> | undefined }[];
}

const id = paneId(1);

const noop = (): void => {};

const fixture = (generation: number, failing = false): Fixture => {
  const disposed: string[] = [];
  const errors: string[] = [];
  const fields: Fixture['fields'] = [];

  const runtime = {
    generation,
    [Symbol.dispose]: () => {
      disposed.push('runtime');

      if (failing) {
        throw new Error('No /proc here.');
      }
    },
  } as unknown as PaneRuntime;

  const publisher = {
    [Symbol.dispose]: () => {
      disposed.push('publisher');

      if (failing) {
        throw new Error('publisher broke');
      }
    },
  } as unknown as RowPublisher;

  const running: RunningPane = {
    runtime,
    publication: { publisher, pending: false },
  };

  const context = {
    options: {
      log: {
        error: (message: string, logged?: Record<string, unknown>) => {
          errors.push(message);
          fields.push(logged);
        },
      },
    },
    runtime: { panes: new Map([[id, running]]) },
  } as unknown as PaneEffectContext;

  return { context, running, disposed, errors, fields };
};

it('leaves the record of the current generation when an older generation is released', () => {
  const { context, running, disposed } = fixture(2);

  releasePane(context, id, 1);

  expect(context.runtime.panes.get(id)).toBe(running);
  expect(disposed).toEqual([]);
});

it('disposes and removes the record of the released generation', () => {
  const { context, disposed } = fixture(2);

  releasePane(context, id, 2);

  expect(context.runtime.panes.has(id)).toBe(false);
  expect(disposed).toEqual(['publisher', 'runtime']);
});

it('runs every release step and logs each failure without throwing', () => {
  const { context, disposed, errors, fields } = fixture(2, true);

  expect(() => {
    releasePane(context, id, 2);
  }).not.toThrow();

  expect(context.runtime.panes.has(id)).toBe(false);
  expect(disposed).toEqual(['publisher', 'runtime']);
  expect(errors).toHaveLength(2);

  expect(fields).toEqual([
    { paneId: id, error: 'publisher broke' },
    { paneId: id, error: 'No /proc here.' },
  ]);
});

const size = { columns: 30, rows: 8 };

const fakePane = (resizeFails = false): Recording => {
  const calls: string[] = [];
  const errors: Recording['errors'] = [];

  const runtime = {
    generation: 4,
    processId: 1,
    resize: (next: typeof size) => {
      calls.push(`runtime resize ${next.columns}x${next.rows}`);

      if (resizeFails) {
        throw new Error('resize broke');
      }
    },
    stop: () => {
      calls.push('stop');

      return Promise.resolve([]);
    },
    exited: Promise.resolve(0),
    [Symbol.dispose]: () => {
      calls.push('dispose runtime');
    },
  } as unknown as PaneRuntime;

  const publisher = {
    resize: (next: typeof size) => {
      calls.push(`publisher resize ${next.columns}x${next.rows}`);
    },
    publish: () => {
      calls.push('publish');
    },
    [Symbol.dispose]: () => {
      calls.push('dispose publisher');
    },
  } as unknown as RowPublisher;

  const running: RunningPane = { runtime, publication: { publisher, pending: false } };

  const context = {
    options: {
      log: {
        error: (message: string, fields?: Record<string, unknown>) => {
          errors.push({ message, fields });
        },
      },
    },
    state: {
      stopping: false,
      panes: [{ id, lifecycle: 'running', size }],
    },
    runtime: { panes: new Map([[id, running]]) },
  } as unknown as PaneEffectContext;

  return { context, running, calls, errors };
};

const nextTurn = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

it('resizes the terminal and the publisher to the size in state, then publishes rows', async () => {
  const { context, calls } = fakePane();

  resizePane(context, id);
  await nextTurn();

  expect(calls).toEqual(['runtime resize 30x8', 'publisher resize 30x8', 'publish']);
});

it('does not resize or publish a pane that has no record', async () => {
  const { context, calls, errors } = fakePane();

  context.runtime.panes.clear();
  resizePane(context, id);
  await nextTurn();

  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

it('does not resize a pane that state no longer holds', async () => {
  const { context, calls, errors } = fakePane();

  context.state.panes = [];
  resizePane(context, id);
  await nextTurn();

  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

it('logs a failed resize and publishes no rows', async () => {
  const { context, calls, errors } = fakePane(true);

  expect(() => {
    resizePane(context, id);
  }).not.toThrow();

  await nextTurn();

  expect(calls).toEqual(['runtime resize 30x8']);
  expect(errors).toHaveLength(1);
  expect(errors[0]?.fields).toEqual({ paneId: id, error: 'resize broke' });
});

it('ignores the release of a pane that has no record', () => {
  const { context } = fixture(2);

  context.runtime.panes.clear();

  expect(() => {
    releasePane(context, id, 2);
  }).not.toThrow();
});

it('describes each failed release step on its own and keeps the cause', () => {
  const { context, errors } = fixture(2, true);

  releasePane(context, id, 2);

  expect(new Set(errors).size).toBe(2);

  for (const message of errors) {
    expect(message).toMatch(/^\S/);
  }
});

it('removes the record of a stopped pane after it stops the pane and its publisher', async () => {
  const { context, calls } = fakePane();

  removePane(context, id);
  await nextTurn();

  expect(context.runtime.panes.has(id)).toBe(false);
  expect(calls.slice(0, 2)).toEqual(['dispose publisher', 'stop']);
});

it('ignores the removal of a pane that has no record', async () => {
  const { context, errors } = fakePane();

  context.runtime.panes.clear();

  expect(() => {
    removePane(context, id);
  }).not.toThrow();

  await nextTurn();

  expect(errors).toEqual([]);
});

it('stops a pane by disposing its publisher and stopping the process', async () => {
  const { context, running, calls } = fakePane();

  const failures = await stopPane(context, id, running);

  expect(failures).toEqual([]);
  expect(calls).toEqual(['dispose publisher', 'stop']);
});

it('finds a running pane with its runtime and publication', () => {
  const { context, running } = fakePane();
  const live = findLivePane(context, id);

  expect(live?.runtime).toBe(running.runtime);
  expect(live?.publication).toBe(running.publication);
  expect(live?.pane.id).toBe(id);
});

it('finds no live pane for a pane that is not running or has no record', () => {
  const stopped = fakePane();
  const unrecorded = fakePane();

  stopped.context.state.panes = stopped.context.state.panes.map((pane) => ({
    ...pane,
    lifecycle: 'exited',
  }));

  unrecorded.context.runtime.panes.clear();

  expect(findLivePane(stopped.context, id)).toBeUndefined();
  expect(findLivePane(unrecorded.context, id)).toBeUndefined();
});

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
    paneStartFailure: undefined,
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
  const colors = spyOn(Terminal.prototype, 'setDefaultColors');

  onTestFinished(() => {
    colors.mockRestore();
  });

  startPane(context, pane, () => {});

  expect(colors).toHaveBeenCalledWith(theme.foreground, theme.background, theme.palette);
});

it('fails only a pane whose output handling throws, and reports no exit for it', async () => {
  const { context, pane, facts, errors } = started({});
  const write = Terminal.prototype.write;
  const decoder = new TextDecoder();
  let seen = '';

  const spy = spyOn(Terminal.prototype, 'write').mockImplementation(function throwOnMarker(
    this: Terminal,
    bytes: Uint8Array,
  ) {
    seen += decoder.decode(bytes, { stream: true });

    if (seen.includes('boom-marker')) {
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

it('gives every running pane the colors the attached client reported', () => {
  const theme = {
    foreground: 0xaa_bb_cc,
    background: 0x11_22_33,
    palette: Array.from({ length: 16 }, (_, index) => index),
  };

  const { context } = started({ theme });
  const painted: unknown[][] = [];

  for (const [index, number] of [1, 2].entries()) {
    const terminal = {
      setDefaultColors: (...colors: unknown[]) => {
        painted.push([index, ...colors]);
      },
    };

    context.runtime.panes.set(paneId(number), {
      runtime: { terminal, [Symbol.dispose]: () => {} } as unknown as PaneRuntime,
      publication: undefined as unknown as RunningPane['publication'],
    });
  }

  applyThemeToPane(context);

  expect(painted).toEqual([
    [0, theme.foreground, theme.background, theme.palette],
    [1, theme.foreground, theme.background, theme.palette],
  ]);
});
