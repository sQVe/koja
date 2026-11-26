import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRecord } from '../kit/fields.ts';
import type { RunCommand } from './gitIdentity.ts';
import {
  linearWorkspaceOf,
  readTickets,
  ticketBatchSize,
  ticketIdOf,
  ticketQueryArgs,
} from './linearTickets.ts';
import type { TicketSource } from './linearTickets.ts';
import type { TicketFacts } from './snapshot.ts';

interface Answer {
  body: string;
  code?: number;
}

const fixtureOf = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'linear', name), 'utf8'));

const ticketsAnswer = (): Record<string, unknown> => {
  const answer = fixtureOf('tickets.json');

  if (!isRecord(answer) || !isRecord(answer['data'])) {
    throw new Error('tickets.json has no data');
  }

  return answer['data'];
};

const runWith = (answers: Answer[], calls: string[][] = []): RunCommand => {
  const pending = [...answers];

  return async (command, args) => {
    calls.push(args);

    const answer = pending.shift();

    if (answer === undefined) {
      return { code: 1, stdout: '', stderr: `unexpected ${command} call` };
    }

    return { code: answer.code ?? 0, stdout: answer.body, stderr: '' };
  };
};

const sourceOf = (ids: string[]): TicketSource => ({
  workspace: 'test-workspace',
  cwd: '/repo',
  machine: null,
  ids,
});

const queryTextOf = (args: readonly string[]): string =>
  args.find((argument) => argument.startsWith('query')) ?? '';

const flagValueOf = (args: readonly string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);

  return index === -1 ? undefined : args[index + 1];
};

const idsOf = (args: readonly string[]): string[] =>
  args
    .filter((argument) => /^id\d+=/.test(argument))
    .map((argument) => argument.slice(argument.indexOf('=') + 1));

const ticketNodeOf = (id: string): Record<string, unknown> => ({
  identifier: id,
  title: `Title of ${id}`,
  state: { name: 'Todo' },
  url: `https://linear.app/sqve/issue/${id}`,
  parent: null,
});

const ticketOf = (id: string): TicketFacts => ({
  id,
  title: `Title of ${id}`,
  state: 'Todo',
  url: `https://linear.app/sqve/issue/${id}`,
  parent: null,
});

const unknownIdAnswer = (index: number): Answer => ({
  code: 3,
  body: JSON.stringify({
    errors: [
      {
        message: 'Entity not found: Issue',
        path: [`ticket${index}`],
        extensions: { type: 'invalid input', code: 'INPUT_ERROR', statusCode: 400 },
      },
    ],
    data: null,
  }),
});

const serviceErrorAnswer = (): Answer => ({
  code: 3,
  body: JSON.stringify({
    errors: [{ message: 'Service unavailable' }],
    data: null,
  }),
});

const runAnswering =
  (calls: string[][] = []): RunCommand =>
  async (_command, args) => {
    calls.push(args);

    const aliases: [string, Record<string, unknown>][] = idsOf(args).map((id, index) => [
      `ticket${index}`,
      ticketNodeOf(id),
    ]);

    const data = Object.fromEntries(aliases);

    return { code: 0, stdout: JSON.stringify({ data }), stderr: '' };
  };

const readOf = (answer: Answer, stillOwner: () => boolean = () => true) =>
  readTickets(runWith([answer]), sourceOf(['ME-1036', 'ME-1035']), stillOwner);

describe('ticketIdOf', () => {
  test('maps a ticket branch to its id', () => {
    expect(ticketIdOf('me-666-list-tdd-the-query', 'whatever')).toBe('ME-666');
  });

  test('falls back to the folder name when the branch has no ticket', () => {
    expect(ticketIdOf('main', 'me-666-list-tdd-the-query')).toBe('ME-666');
  });

  test('falls back to the folder name without a branch', () => {
    expect(ticketIdOf(null, 'me-666-list-tdd-the-query')).toBe('ME-666');
  });

  test('returns null when neither the branch nor the folder names a ticket', () => {
    expect(ticketIdOf('analyze-mutation-ci-runtime', 'analyze-mutation-ci-runtime')).toBeNull();
    expect(ticketIdOf(null, 'analyze-mutation-ci-runtime')).toBeNull();
  });
});

describe('ticketQueryArgs', () => {
  test('asks for several tickets in one query', () => {
    const args = ticketQueryArgs(['ME-1', 'ME-2']);
    const query = queryTextOf(args);

    expect(query).toContain('ticket0:');
    expect(query).toContain('ticket1:');
    expect(query).not.toContain('ticket2:');
    expect(query).toContain('$id0: String!, $id1: String!');
    expect(query).not.toContain('ME-1');
    expect(query).not.toContain('ME-2');
    expect(args[0]).toBe('api');
    expect(flagValueOf(args, '--variable')).toBe('id0=ME-1');
    expect(args).toContain('id0=ME-1');
    expect(args).toContain('id1=ME-2');
  });

  test('refuses an empty list', () => {
    expect(() => ticketQueryArgs([])).toThrow('ticketQueryArgs takes at least 1 ticket id');
  });

  test('refuses more tickets than one batch', () => {
    const ids = Array.from({ length: ticketBatchSize + 1 }, (_, index) => `ME-${index + 1}`);

    expect(() => ticketQueryArgs(ids)).toThrow(
      `ticketQueryArgs takes at most ${ticketBatchSize} ticket ids`,
    );
  });
});

describe('readTickets', () => {
  test('reads two tickets from one answer', async () => {
    const calls: string[][] = [];

    const read = await readTickets(
      runWith([{ body: JSON.stringify({ data: ticketsAnswer() }) }], calls),
      sourceOf(['ME-1036', 'ME-1035']),
      () => true,
    );

    const tickets = read.kind === 'read' ? read.tickets : [];
    const [call] = calls;

    expect(read).toEqual({
      kind: 'read',
      tickets: [
        {
          id: 'ME-1036',
          title: 'Title spaces with their Linear tickets',
          state: 'In Progress',
          url: 'https://linear.app/sqve/issue/ME-1036/title-spaces-with-their-linear-tickets',
          parent: 'ME-1031',
        },
        {
          id: 'ME-1035',
          title: 'Read what each PR needs for the sidebar',
          state: 'Done',
          url: 'https://linear.app/sqve/issue/ME-1035/read-what-each-pr-needs-for-the-sidebar',
          parent: 'ME-1031',
        },
      ],
    });

    expect(tickets).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(flagValueOf(call ?? [], '--workspace')).toBe('test-workspace');
  });

  test('reads a ticket with no parent', async () => {
    const data = ticketsAnswer();
    const ticket = data['ticket0'];

    if (!isRecord(ticket)) {
      throw new Error('tickets.json has no ticket0');
    }

    ticket['parent'] = null;

    const read = await readOf({ body: JSON.stringify({ data }) });
    const parent = read.kind === 'read' ? read.tickets[0]?.parent : undefined;

    expect(parent).toBeNull();
  });

  test('fails on a missing alias', async () => {
    const data = ticketsAnswer();

    delete data['ticket1'];

    expect(await readOf({ body: JSON.stringify({ data }) })).toEqual({ kind: 'failed' });
  });

  test('reads no tickets without a call', async () => {
    const calls: string[][] = [];
    const read = await readTickets(runWith([], calls), sourceOf([]), () => true);

    expect(read).toEqual({ kind: 'read', tickets: [] });
    expect(calls).toHaveLength(0);
  });

  test('drops the read when the lease is lost', async () => {
    const calls: string[][] = [];
    const read = await readTickets(runWith([], calls), sourceOf(['ME-1']), () => false);

    expect(read).toEqual({ kind: 'dropped' });
    expect(calls).toHaveLength(0);
  });

  test('asks for 51 tickets in two calls', async () => {
    const calls: string[][] = [];
    const ids = Array.from({ length: ticketBatchSize + 1 }, (_, index) => `ME-${index + 1}`);
    const read = await readTickets(runAnswering(calls), sourceOf(ids), () => true);

    expect(calls).toHaveLength(2);
    expect(idsOf(calls[0] ?? [])).toHaveLength(ticketBatchSize);
    expect(idsOf(calls[1] ?? [])).toHaveLength(1);

    const ticketCount = read.kind === 'read' ? read.tickets.length : 0;

    expect(ticketCount).toBe(ticketBatchSize + 1);
  });

  test('fails on a nonzero exit', async () => {
    const body = JSON.stringify({ data: ticketsAnswer() });

    expect(await readOf({ body, code: 1 })).toEqual({ kind: 'failed' });
  });

  test('keeps the known ticket when another id does not resolve', async () => {
    const calls: string[][] = [];

    const run: RunCommand = async (_command, args) => {
      calls.push(args);

      const asked = idsOf(args);
      const unknown = asked.indexOf('ME-9999');

      if (unknown !== -1) {
        const answer = unknownIdAnswer(unknown);

        return { code: answer.code ?? 0, stdout: answer.body, stderr: '' };
      }

      const aliases: [string, Record<string, unknown>][] = asked.map((id, index) => [
        `ticket${index}`,
        ticketNodeOf(id),
      ]);

      return { code: 0, stdout: JSON.stringify({ data: Object.fromEntries(aliases) }), stderr: '' };
    };

    const read = await readTickets(run, sourceOf(['ME-1036', 'ME-9999']), () => true);

    expect(read).toEqual({ kind: 'read', tickets: [ticketOf('ME-1036')] });
    expect(calls).toHaveLength(3);
  });

  test('fails on a service error without retrying each id', async () => {
    const calls: string[][] = [];
    const ids = Array.from({ length: ticketBatchSize }, (_, index) => `ME-${index + 1}`);

    const read = await readTickets(
      runWith([serviceErrorAnswer()], calls),
      sourceOf(ids),
      () => true,
    );

    expect(read).toEqual({ kind: 'failed' });
    expect(calls).toHaveLength(1);
  });

  test('reads the tickets when data parses even if errors name no id', async () => {
    const calls: string[][] = [];

    const body = JSON.stringify({
      data: ticketsAnswer(),
      errors: [{ message: 'Service unavailable' }],
    });

    const read = await readTickets(
      runWith([{ body }], calls),
      sourceOf(['ME-1036', 'ME-1035']),
      () => true,
    );

    expect(read).toEqual({
      kind: 'read',
      tickets: [
        {
          id: 'ME-1036',
          title: 'Title spaces with their Linear tickets',
          state: 'In Progress',
          url: 'https://linear.app/sqve/issue/ME-1036/title-spaces-with-their-linear-tickets',
          parent: 'ME-1031',
        },
        {
          id: 'ME-1035',
          title: 'Read what each PR needs for the sidebar',
          state: 'Done',
          url: 'https://linear.app/sqve/issue/ME-1035/read-what-each-pr-needs-for-the-sidebar',
          parent: 'ME-1031',
        },
      ],
    });

    expect(calls).toHaveLength(1);
  });

  test('keeps the parsed tickets and retries only the id whose alias is missing', async () => {
    const calls: string[][] = [];

    const run: RunCommand = async (_command, args) => {
      calls.push(args);

      const asked = idsOf(args);

      if (calls.length === 1) {
        return {
          code: 0,
          stdout: JSON.stringify({
            data: { ticket0: ticketNodeOf(asked[0] ?? 'ME-1036') },
            errors: [{ message: 'Entity not found: Issue', path: ['ticket1'] }],
          }),
          stderr: '',
        };
      }

      const data = Object.fromEntries(
        asked.map((id, index) => [`ticket${index}`, ticketNodeOf(id)]),
      );

      return { code: 0, stdout: JSON.stringify({ data }), stderr: '' };
    };

    const read = await readTickets(run, sourceOf(['ME-1036', 'ME-9999']), () => true);

    expect(read).toEqual({ kind: 'read', tickets: [ticketOf('ME-1036'), ticketOf('ME-9999')] });
    expect(calls).toHaveLength(2);
    expect(idsOf(calls[1] ?? [])).toEqual(['ME-9999']);
  });

  test('keeps the ticket when a single-id answer carries data and a named error', async () => {
    const calls: string[][] = [];

    const body = JSON.stringify({
      data: { ticket0: ticketNodeOf('ME-9999') },
      errors: [{ message: 'Entity not found: Issue', path: ['ticket0'] }],
    });

    const read = await readTickets(runWith([{ body }], calls), sourceOf(['ME-9999']), () => true);

    expect(read).toEqual({ kind: 'read', tickets: [ticketOf('ME-9999')] });
    expect(calls).toHaveLength(1);
  });

  test('fails when a retry command fails', async () => {
    const calls: string[][] = [];

    const read = await readTickets(
      runWith([unknownIdAnswer(0), { code: 1, body: '' }], calls),
      sourceOf(['ME-1036', 'ME-9999']),
      () => true,
    );

    expect(read).toEqual({ kind: 'failed' });
    expect(calls).toHaveLength(2);
  });

  test('fails when no id in the batch resolves', async () => {
    const read = await readTickets(
      runWith([unknownIdAnswer(0), unknownIdAnswer(0), unknownIdAnswer(0)]),
      sourceOf(['ME-9998', 'ME-9999']),
      () => true,
    );

    expect(read).toEqual({ kind: 'failed' });
  });

  test('fails without asking each id when the answer has no errors', async () => {
    const calls: string[][] = [];

    const read = await readTickets(
      runWith([{ body: JSON.stringify({ data: null }) }], calls),
      sourceOf(['ME-1', 'ME-2']),
      () => true,
    );

    expect(read).toEqual({ kind: 'failed' });
    expect(calls).toHaveLength(1);
  });

  test('drops the read when the lease is lost while isolating ids', async () => {
    const calls: string[][] = [];
    let ownerChecks = 0;

    const stillOwner = (): boolean => {
      ownerChecks += 1;

      return ownerChecks === 1;
    };

    const read = await readTickets(
      runWith([unknownIdAnswer(0)], calls),
      sourceOf(['ME-9999', 'ME-1036']),
      stillOwner,
    );

    expect(read).toEqual({ kind: 'dropped' });
    expect(calls).toHaveLength(1);
  });

  test('fails on an answer that is not a JSON object', async () => {
    for (const body of ['not json', 'null', '[]']) {
      const read = await readOf({ body });

      expect(read).toEqual({ kind: 'failed' });
    }
  });

  test('fails on a malformed ticket', async () => {
    const breakages: ((ticket: Record<string, unknown>) => void)[] = [
      (ticket) => {
        delete ticket['title'];
      },
      (ticket) => {
        delete ticket['identifier'];
      },
      (ticket) => {
        delete ticket['url'];
      },
      (ticket) => {
        ticket['state'] = {};
      },
      (ticket) => {
        ticket['parent'] = {};
      },
      (ticket) => {
        ticket['parent'] = 'ME-1';
      },
    ];

    for (const breakTicket of breakages) {
      const data = ticketsAnswer();
      const ticket = data['ticket0'];

      if (!isRecord(ticket)) {
        throw new Error('tickets.json has no ticket0');
      }

      breakTicket(ticket);

      const read = await readOf({ body: JSON.stringify({ data }) });

      expect(read).toEqual({ kind: 'failed' });
    }
  });
});

describe('linearWorkspaceOf', () => {
  test('reads the workspace from a toml', () => {
    expect(linearWorkspaceOf('workspace = "sqve"\n')).toBe('sqve');
    expect(linearWorkspaceOf('team = "ME"\n')).toBeNull();
  });

  test('reads a quoted workspace value with leading whitespace', () => {
    expect(linearWorkspaceOf('  workspace = "sqve"\n')).toBe('sqve');
    expect(linearWorkspaceOf('\tworkspace="sqve"\n')).toBe('sqve');
  });

  test('rejects an unquoted workspace value', () => {
    expect(linearWorkspaceOf('workspace = sqve\n')).toBeNull();
  });
});
