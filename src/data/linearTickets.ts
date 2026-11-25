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

const workspaceLine = /^workspace[ \t]*=[ \t]*"([^"]*)"/m;

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

  return { id, title, state, url, parent, failed: false };
};

const dataOf = (result: ExecResult): Record<string, unknown> | null => {
  if (result.code !== 0) {
    return null;
  }

  let body: unknown;

  try {
    body = JSON.parse(result.stdout);
  } catch {
    return null;
  }

  if (!isRecord(body)) {
    return null;
  }

  const data = body['data'];

  return isRecord(data) ? data : null;
};

const batchTicketsOf = (result: ExecResult, ids: string[]): TicketFacts[] | null => {
  const data = dataOf(result);

  if (data === null) {
    return null;
  }

  const tickets: TicketFacts[] = [];

  for (const index of ids.keys()) {
    const facts = ticketFactsOf(data[`ticket${index}`]);

    if (facts === null) {
      return null;
    }

    tickets.push(facts);
  }

  return tickets;
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
    if (!stillOwner()) {
      return { kind: 'dropped' };
    }

    const args = [...ticketQueryArgs(batch), '--workspace', source.workspace];

    // eslint-disable-next-line no-await-in-loop -- one batch at a time, so a failure stops the read early
    const result = await run('linear', args, { cwd: source.cwd, on: source.machine });

    const batchTickets = batchTicketsOf(result, batch);

    if (batchTickets === null) {
      return { kind: 'failed' };
    }

    tickets.push(...batchTickets);
  }

  return { kind: 'read', tickets };
};
