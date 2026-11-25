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
    expect(ticketIdOf('analyze-mutation-ci-runtime', 'analyze-mutation-ci-runtime')).toBeNull();
  });

  test('falls back to the folder name', () => {
    expect(ticketIdOf('main', 'me-666-list-tdd-the-query')).toBe('ME-666');
    expect(ticketIdOf(null, 'me-666-list-tdd-the-query')).toBe('ME-666');
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
          failed: false,
        },
        {
          id: 'ME-1035',
          title: 'Read what each PR needs for the sidebar',
          state: 'Done',
          url: 'https://linear.app/sqve/issue/ME-1035/read-what-each-pr-needs-for-the-sidebar',
          parent: 'ME-1031',
          failed: false,
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
});
