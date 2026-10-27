import { expect, it } from 'bun:test';

import { clientId, paneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { applyIntent, createState } from '../store/store.ts';
import type { Fact, Pane, Theme } from '../store/store.ts';
import { createTerminal } from '../vt/vt.ts';
import type { Connection } from './connection.ts';
import type { PaneRuntime, spawnPane } from './pane.ts';
import type { PaneEffectContext } from './paneEffects.ts';
import {
  applyThemeToPane,
  findLivePane,
  focusedRuntime,
  recordPane,
  releasePane,
  reportOutputFailure,
  reportPaneExit,
  startPane,
  removePane,
  resizePane,
  stopPane,
} from './paneEffects.ts';
import type { RunningPane } from './paneRecord.ts';
import { maxReplyBytes } from './paneRows.ts';
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

interface Spawned {
  spawn: typeof spawnPane;
  options: () => Parameters<typeof spawnPane>[0];
  exit: (code: number) => void;
  runtime: PaneRuntime;
}

const id = paneId(1);

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
    reportPass: 'a'.repeat(64),
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

  const running: RunningPane = {
    runtime,
    reportPass: 'a'.repeat(64),
    publication: { publisher, pending: false },
  };

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

const themedContext = (theme: Theme): PaneEffectContext => {
  const created = applyIntent(createState(), {
    type: 'createWorkspace',
    root: '/tmp',
    label: 'test',
    focus: true,
  });

  invariant(created.kind === 'applied', 'The workspace was refused.');

  const attached = applyIntent(created.state, { type: 'attachClient', size });

  invariant(attached.kind === 'applied', 'The client was refused.');

  const client = attached.state.clients[0];

  invariant(client !== undefined, 'The client is missing.');

  const themed = applyIntent(attached.state, {
    type: 'setClientTheme',
    clientId: client.id,
    theme,
  });

  invariant(themed.kind === 'applied', 'The theme was refused.');

  return {
    state: themed.state,
    runtime: { panes: new Map() },
  } as unknown as PaneEffectContext;
};

const paneWithTerminal = (generation: number, exited = Promise.resolve(0)): RunningPane => {
  const created = createTerminal(size.columns, size.rows, 1_000_000);

  invariant(created.ok, 'The terminal was refused.');

  const { terminal } = created;

  const runtime: PaneRuntime = {
    generation,
    processId: 1,
    scoped: false,
    terminal,
    exited,
    write: () => {},
    resize: () => {},
    text: () => '',
    stop: () => Promise.resolve([]),
    [Symbol.dispose]: () => {
      terminal[Symbol.dispose]();
    },
  };

  const publisher: RowPublisher = {
    subscribe: () => {
      throw new Error('Not used.');
    },
    publish: () => {},
    resize: () => {},
    whenReleased: () => Promise.resolve(),
    waitForRead: () => Promise.resolve(),
    forgetReads: () => {},
    [Symbol.dispose]: () => {},
  };

  return { runtime, reportPass: 'a'.repeat(64), publication: { publisher, pending: false } };
};

const backgroundReply = (running: RunningPane): string => {
  const { reply } = running.runtime.terminal.write(new TextEncoder().encode('\u001B]11;?\u001B\\'));

  return new TextDecoder().decode(reply);
};

it('gives every running pane the colors the attached client reported', () => {
  const context = themedContext({
    foreground: 0xaa_bb_cc,
    background: 0x11_22_33,
    palette: Array.from({ length: 16 }, (_, index) => index),
  });

  const panes = [paneWithTerminal(1), paneWithTerminal(2)];

  for (const [index, running] of panes.entries()) {
    context.runtime.panes.set(paneId(index + 1), running);
  }

  const before = panes.map(backgroundReply);

  applyThemeToPane(context);

  const after = panes.map(backgroundReply);

  for (const running of panes) {
    running.runtime[Symbol.dispose]();
  }

  expect(after.every((reply) => reply.includes('1111/2222/3333'))).toBe(true);
  expect(before.some((reply) => reply.includes('1111/2222/3333'))).toBe(false);
});

const paneOf = (restored: boolean): Pane => {
  const context = themedContext({ foreground: 0, background: 0, palette: [] });
  const pane = context.state.panes[0];

  invariant(pane !== undefined, 'The pane is missing.');

  return { ...pane, id, generation: 4, restored };
};

const exitFixture = (
  restored: boolean,
  options: { scoped: boolean; text: string; stopping?: boolean },
) => {
  const { context, running, errors } = fakePane();
  const facts: Fact[] = [];
  const logged: { message: string; fields: Record<string, unknown> | undefined }[] = [];

  const runtime: PaneRuntime = {
    ...running.runtime,
    scoped: options.scoped,
    text: () => options.text,
  };

  context.runtime.panes.set(id, { ...running, runtime });
  context.state.stopping = options.stopping ?? false;

  context.options.log.info = (message, fields) => {
    logged.push({ message, fields });
  };

  return { context, runtime, facts, errors, logged, pane: paneOf(restored) };
};

const failedStart = 'Failed to execute /missing: No such file';

it('releases the pane and reports a failed pane when its output fails', () => {
  const { context, errors, pane, running } = (() => {
    const fake = fakePane();

    return { ...fake, pane: paneOf(false) };
  })();

  const facts: Fact[] = [];

  reportOutputFailure(context, pane, 'marker rejected', (fact) => facts.push(fact));

  expect(facts).toEqual([
    {
      type: 'paneFailed',
      paneId: id,
      generation: 4,
      message: expect.stringContaining('marker rejected') as string,
    },
  ]);

  expect(context.runtime.panes.has(id)).toBe(false);
  expect(errors).toHaveLength(1);
  expect(errors[0]?.message).not.toBe('');

  expect(errors[0]?.fields).toEqual({
    paneId: id,
    message: expect.stringContaining('marker rejected') as string,
  });

  expect(running.runtime.generation).toBe(4);
});

it('reports the exit code of a pane that exits', () => {
  const { context, runtime, pane, logged } = exitFixture(false, { scoped: false, text: '' });
  const facts: Fact[] = [];

  reportPaneExit(context, { pane, runtime, exitCode: 3, outputFailed: false }, (fact) =>
    facts.push(fact),
  );

  expect(facts).toEqual([{ type: 'paneExited', paneId: id, generation: 4, exitCode: 3 }]);
  expect(logged).toHaveLength(1);
  expect(logged[0]?.message).not.toBe('');
  expect(logged[0]?.fields).toEqual({ paneId: id, exitCode: 3 });

  expect(context.runtime.panes.has(id)).toBe(true);
});

it('reports no exit for a pane whose output failed', () => {
  const { context, runtime, pane, logged } = exitFixture(false, { scoped: false, text: '' });
  const facts: Fact[] = [];

  reportPaneExit(context, { pane, runtime, exitCode: 0, outputFailed: true }, (fact) =>
    facts.push(fact),
  );

  expect(facts).toEqual([]);
  expect(logged).toHaveLength(1);
  expect(logged[0]?.message).not.toBe('');
  expect(logged[0]?.fields).toEqual({ paneId: id, exitCode: 0 });

  expect(context.runtime.panes.has(id)).toBe(true);
});

it('releases a restored pane whose scoped shell cannot execute and reports a failed start', () => {
  const { context, runtime, pane, errors } = exitFixture(true, {
    scoped: true,
    text: `systemd-run\n${failedStart}\n`,
  });

  const facts: Fact[] = [];

  reportPaneExit(context, { pane, runtime, exitCode: 1, outputFailed: false }, (fact) =>
    facts.push(fact),
  );

  expect(errors).toHaveLength(1);
  expect(errors[0]?.message).not.toBe('');

  expect(errors[0]?.fields).toEqual({
    paneId: id,
    message: expect.stringContaining(failedStart) as string,
  });

  expect(facts).toHaveLength(1);
  expect(facts[0]).toMatchObject({ type: 'paneFailedToStart', paneId: id, generation: 4 });

  expect(facts[0]).toMatchObject({
    message: expect.stringContaining(failedStart) as string,
  });

  expect(context.runtime.panes.has(id)).toBe(false);
});

it('reports a plain exit when the server is stopping, a pane is not restored, or the code is not 1', () => {
  const variants = [
    { restored: true, scoped: true, stopping: true, exitCode: 1 },
    { restored: false, scoped: true, stopping: false, exitCode: 1 },
    { restored: true, scoped: false, stopping: false, exitCode: 1 },
    { restored: true, scoped: true, stopping: false, exitCode: 2 },
  ];

  for (const variant of variants) {
    const { context, runtime, pane } = exitFixture(variant.restored, {
      scoped: variant.scoped,
      text: failedStart,
      stopping: variant.stopping,
    });

    const facts: Fact[] = [];

    reportPaneExit(
      context,
      { pane, runtime, exitCode: variant.exitCode, outputFailed: false },
      (fact) => facts.push(fact),
    );

    expect(facts).toEqual([
      { type: 'paneExited', paneId: id, generation: 4, exitCode: variant.exitCode },
    ]);

    expect(context.runtime.panes.has(id)).toBe(true);
  }
});

it('records a pane with a publication that is not pending', () => {
  const { context, running } = fakePane();
  const { publisher } = running.publication;

  context.runtime.panes.clear();
  recordPane(context, id, { ...running, publication: { publisher, pending: false } });

  const recorded = context.runtime.panes.get(id);

  expect(recorded?.runtime).toBe(running.runtime);
  expect(recorded?.publication.publisher).toBe(publisher);
  expect(recorded?.publication.pending).toBe(false);
});

it('finds the runtime of the focused pane', () => {
  const context = themedContext({ foreground: 0, background: 0, palette: [] });
  const running = paneWithTerminal(1);
  const focused = context.state.panes[0];

  invariant(focused !== undefined, 'The pane is missing.');

  context.runtime.panes.set(focused.id, running);
  context.runtime.panes.set(paneId(9), paneWithTerminal(2));

  expect(focusedRuntime(context.state, context.runtime.panes)).toBe(running.runtime);

  running.runtime[Symbol.dispose]();
});

it('finds no runtime when no pane is focused or the focused pane has no record', () => {
  const context = themedContext({ foreground: 0, background: 0, palette: [] });

  expect(focusedRuntime(context.state, context.runtime.panes)).toBeUndefined();
  expect(focusedRuntime(createState(), context.runtime.panes)).toBeUndefined();
});

const startContext = (): { context: PaneEffectContext; pane: Pane } => {
  const themed = themedContext({
    foreground: 0,
    background: 0,
    palette: Array.from({ length: 16 }, () => 0),
  });

  const first = themed.state.panes[0];

  invariant(first !== undefined, 'The pane is missing.');

  const context: PaneEffectContext = {
    options: {
      log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      environment: {},
      socketPath: '/tmp/koja-test.sock',
      binaryPath: '/tmp/koja-test',
      version: { version: 'test', ghostty: 'test' },
    },
    state: themed.state,
    runtime: { panes: new Map(), clientIds: new Map(), paneScopes: false },
  };

  return { context, pane: { ...first, restored: false } };
};

const fakeSpawn = (generation: number): Spawned => {
  const { promise, resolve } = Promise.withResolvers<number>();
  const { runtime } = paneWithTerminal(generation, promise);
  let given: Parameters<typeof spawnPane>[0] | undefined;

  return {
    spawn: (options) => {
      given = options;

      return { ok: true, pane: runtime };
    },
    options: () => {
      invariant(given !== undefined, 'No pane was spawned.');

      return given;
    },
    exit: resolve,
    runtime,
  };
};

const settle = async (): Promise<void> => {
  await nextTurn();
  await nextTurn();
};

it('starts a pane, records it, and reports it started and later exited', async () => {
  const { context, pane } = startContext();
  const spawned = fakeSpawn(pane.generation);
  const facts: Fact[] = [];

  startPane(context, pane, (fact) => facts.push(fact), spawned.spawn);

  const recorded = context.runtime.panes.get(pane.id);

  expect(recorded?.runtime).toBe(spawned.runtime);
  expect(recorded?.reportPass).toBe(spawned.options().identity.reportPass);
  expect(recorded?.reportPass).toMatch(/^[0-9a-f]{64}$/);
  expect(recorded?.publication.pending).toBe(false);
  expect(facts).toEqual([{ type: 'paneStarted', paneId: pane.id, generation: pane.generation }]);

  spawned.exit(3);
  await settle();

  expect(facts.at(-1)).toEqual({
    type: 'paneExited',
    paneId: pane.id,
    generation: pane.generation,
    exitCode: 3,
  });

  spawned.runtime[Symbol.dispose]();
});

it('releases a pane whose output fails and reports no exit for it', async () => {
  const { context, pane } = startContext();
  const spawned = fakeSpawn(pane.generation);
  const facts: Fact[] = [];

  startPane(context, pane, (fact) => facts.push(fact), spawned.spawn);
  spawned.options().onFailed('marker rejected');
  spawned.exit(137);
  await settle();

  expect(facts).toEqual([
    { type: 'paneStarted', paneId: pane.id, generation: pane.generation },
    {
      type: 'paneFailed',
      paneId: pane.id,
      generation: pane.generation,
      message: expect.stringContaining('marker rejected') as string,
    },
  ]);

  expect(context.runtime.panes.has(pane.id)).toBe(false);
});

const foregroundConnection = (context: PaneEffectContext): ControlMessage[] => {
  const sent: ControlMessage[] = [];
  const foreground = clientId(1);

  const connection: Connection = {
    receive: () => {},
    drain: () => {},
    send: (message) => {
      sent.push(message);
    },
    sendBinary: () => {},
    close: () => {},
    closeWhenFlushed: () => {},
    isClosed: () => false,
    isFlushed: () => true,
    isWelcomed: () => true,
  };

  context.runtime.clientIds.set(connection, foreground);
  context.state = { ...context.state, foregroundClientId: foreground };

  return sent;
};

it('sends a clipboard write from a pane to the foreground client', () => {
  const { context, pane } = startContext();
  const spawned = fakeSpawn(pane.generation);
  const sent = foregroundConnection(context);

  startPane(context, pane, () => {}, spawned.spawn);
  spawned.options().onClipboard('copied text');

  expect(sent).toEqual([{ type: 'clipboardWrite', text: 'copied text' }]);

  spawned.runtime[Symbol.dispose]();
});

it('drops a clipboard write whose message is over the reply limit', () => {
  const { context, pane } = startContext();
  const spawned = fakeSpawn(pane.generation);
  const sent = foregroundConnection(context);

  startPane(context, pane, () => {}, spawned.spawn);
  spawned.options().onClipboard('a'.repeat(maxReplyBytes + 1));

  expect(sent).toEqual([]);

  spawned.runtime[Symbol.dispose]();
});
