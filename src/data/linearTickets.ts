import type { ExecResult } from 'herdr';

import { isRecord, stringOf } from '../kit/fields.ts';
import type { RunCommand } from './gitIdentity.ts';
import type { TicketFacts } from './snapshot.ts';

export interface TicketSource {
  workspace: string;
  cwd: string;
  machine: string | null;
  ids: string[];
}

export type TicketRead =
  | { kind: 'read'; tickets: TicketFacts[] }
  | { kind: 'failed' }
  | { kind: 'dropped' };

type BatchAnswer =
  | { kind: 'tickets'; tickets: TicketFacts[] }
  | { kind: 'retry'; ids: string[]; tickets: TicketFacts[] }
  | { kind: 'failed' };

type BatchRead =
  | { kind: 'tickets'; tickets: TicketFacts[] }
  | { kind: 'failed' }
  | { kind: 'dropped' };

type AnswerBody =
  | { kind: 'data'; data: Record<string, unknown>; retryIds: string[] }
  | { kind: 'retry'; retryIds: string[] }
  | { kind: 'failed' };

interface ParsedAliases {
  tickets: TicketFacts[];
  missingIds: string[];
}

export const ticketBatchSize = 50;

const ticketIdPattern = /^([A-Za-z]+)-(\d+)(?:-|$)/;

const ticketIdIn = (name: string): string | null => {
  const match = ticketIdPattern.exec(name);

  if (match === null) {
    return null;
  }

  const [, key, number] = match;

  if (key === undefined || number === undefined) {
    return null;
  }

  return `${key}-${number}`.toUpperCase();
};

export const ticketIdOf = (branch: string | null, folder: string): string | null => {
  const fromBranch = branch === null ? null : ticketIdIn(branch);

  return fromBranch ?? ticketIdIn(folder);
};

const workspaceLine = /^[ \t]*workspace[ \t]*=[ \t]*"([^"]*)"/m;

export const linearWorkspaceOf = (toml: string): string | null => {
  const match = workspaceLine.exec(toml);

  return match?.[1] ?? null;
};

const ticketFields = 'identifier title state { name } url parent { identifier }';

const aliasOf = (index: number): string =>
  `  ticket${index}: issue(id: $id${index}) { ${ticketFields} }`;

const ticketVariables = (ticketCount: number): string[] =>
  Array.from({ length: ticketCount }, (_, index) => `$id${index}: String!`);

const queryText = (ticketCount: number): string => {
  const lines = [`query (${ticketVariables(ticketCount).join(', ')}) {`];

  for (let index = 0; index < ticketCount; index += 1) {
    lines.push(aliasOf(index));
  }

  lines.push('}');

  return lines.join('\n');
};

export const ticketQueryArgs = (ids: string[]): string[] => {
  if (ids.length === 0) {
    throw new Error('ticketQueryArgs takes at least 1 ticket id');
  }

  if (ids.length > ticketBatchSize) {
    throw new Error(`ticketQueryArgs takes at most ${ticketBatchSize} ticket ids`);
  }

  const args = ['api'];

  for (const [index, id] of ids.entries()) {
    args.push('--variable', `id${index}=${id}`);
  }

  args.push(queryText(ids.length));

  return args;
};

const parentOf = (value: unknown): string | null | undefined => {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return stringOf(value['identifier']) ?? undefined;
};

const ticketFactsOf = (value: unknown): TicketFacts | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = stringOf(value['identifier']);
  const title = stringOf(value['title']);
  const url = stringOf(value['url']);
  const state = isRecord(value['state']) ? stringOf(value['state']['name']) : null;
  const parent = parentOf(value['parent']);
  const missingText = id === null || title === null || url === null;

  if (missingText || state === null) {
    return null;
  }

  if (parent === undefined) {
    return null;
  }

  return { id, title, state, url, parent };
};

const ticketAliasPattern = /^ticket(\d+)$/;

const retryIdsOf = (errors: unknown, ids: string[]): string[] => {
  if (!Array.isArray(errors)) {
    return [];
  }

  const named = new Set<string>();

  for (const error of errors) {
    if (!isRecord(error) || !Array.isArray(error['path'])) {
      continue;
    }

    for (const part of error['path']) {
      if (typeof part !== 'string') {
        continue;
      }

      const match = ticketAliasPattern.exec(part);

      if (match === null) {
        continue;
      }

      const [, index] = match;

      if (index === undefined) {
        continue;
      }

      const id = ids[Number(index)];

      if (id !== undefined) {
        named.add(id);
      }
    }
  }

  return [...named];
};

const answerBodyOf = (result: ExecResult, ids: string[]): AnswerBody => {
  let body: unknown;

  try {
    body = JSON.parse(result.stdout);
  } catch {
    return { kind: 'failed' };
  }

  if (!isRecord(body)) {
    return { kind: 'failed' };
  }

  const retryIds = retryIdsOf(body['errors'], ids);
  const data = result.code === 0 && isRecord(body['data']) ? body['data'] : null;

  if (data !== null) {
    return { kind: 'data', data, retryIds };
  }

  if (retryIds.length === 0) {
    return { kind: 'failed' };
  }

  return { kind: 'retry', retryIds };
};

const ticketsOfAliases = (data: Record<string, unknown>, ids: string[]): ParsedAliases => {
  const tickets: TicketFacts[] = [];
  const missingIds: string[] = [];

  for (const [index, id] of ids.entries()) {
    const facts = ticketFactsOf(data[`ticket${index}`]);

    if (facts === null) {
      missingIds.push(id);
    } else {
      tickets.push(facts);
    }
  }

  return { tickets, missingIds };
};

const queryTickets = async (
  run: RunCommand,
  source: TicketSource,
  ids: string[],
): Promise<BatchAnswer> => {
  const args = [...ticketQueryArgs(ids), '--workspace', source.workspace];
  const result = await run('linear', args, { cwd: source.cwd, on: source.machine });
  const answer = answerBodyOf(result, ids);

  if (answer.kind === 'failed') {
    return { kind: 'failed' };
  }

  if (answer.kind === 'data') {
    const parsed = ticketsOfAliases(answer.data, ids);

    if (parsed.missingIds.length === 0) {
      return { kind: 'tickets', tickets: parsed.tickets };
    }

    const missing = new Set(parsed.missingIds);
    const retryIds = answer.retryIds.filter((id) => missing.has(id));

    if (retryIds.length === 0) {
      return { kind: 'failed' };
    }

    return { kind: 'retry', ids: retryIds, tickets: parsed.tickets };
  }

  return { kind: 'retry', ids: answer.retryIds, tickets: [] };
};

// Linear answers no data for the whole query when one issue id does not exist, and the error path
// names that alias. The read asks the named ids alone and then the rest, so the ids that do resolve
// still arrive and an error about the service fails the read instead.
const ticketsOfBatch = async (
  run: RunCommand,
  source: TicketSource,
  ids: string[],
  stillOwner: () => boolean,
): Promise<BatchRead> => {
  const tickets: TicketFacts[] = [];
  let pending = ids;

  while (pending.length > 0) {
    const asked = pending;

    if (!stillOwner()) {
      return { kind: 'dropped' };
    }

    // eslint-disable-next-line no-await-in-loop -- one query at a time, so a failure stops the read early
    const answer = await queryTickets(run, source, asked);

    if (answer.kind === 'failed') {
      return { kind: 'failed' };
    }

    tickets.push(...answer.tickets);

    if (answer.kind === 'tickets') {
      return { kind: 'tickets', tickets };
    }

    const retried = new Set(answer.ids);
    const parsed = new Set(answer.tickets.map((ticket) => ticket.id));

    pending = asked.filter((id) => !retried.has(id) && !parsed.has(id));

    for (const id of answer.ids) {
      if (asked.length === 1) {
        continue;
      }

      if (!stillOwner()) {
        return { kind: 'dropped' };
      }

      // eslint-disable-next-line no-await-in-loop -- one id at a time, so one unknown id does not hide the rest
      const single = await queryTickets(run, source, [id]);

      if (single.kind === 'failed') {
        return { kind: 'failed' };
      }

      tickets.push(...single.tickets);
    }
  }

  return { kind: 'tickets', tickets };
};

const batchesOf = (ids: string[]): string[][] => {
  const batches: string[][] = [];

  for (let index = 0; index < ids.length; index += ticketBatchSize) {
    batches.push(ids.slice(index, index + ticketBatchSize));
  }

  return batches;
};

export const readTickets = async (
  run: RunCommand,
  source: TicketSource,
  stillOwner: () => boolean,
): Promise<TicketRead> => {
  const tickets: TicketFacts[] = [];

  for (const batch of batchesOf(source.ids)) {
    // eslint-disable-next-line no-await-in-loop -- one batch at a time, so a failure stops the read early
    const resolved = await ticketsOfBatch(run, source, batch, stillOwner);

    if (resolved.kind === 'dropped') {
      return { kind: 'dropped' };
    }

    if (resolved.kind === 'failed') {
      return { kind: 'failed' };
    }

    tickets.push(...resolved.tickets);
  }

  if (tickets.length === 0 && source.ids.length > 0) {
    return { kind: 'failed' };
  }

  return { kind: 'read', tickets };
};
