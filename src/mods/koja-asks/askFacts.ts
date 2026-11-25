import { listOf, recordOf, stringOf } from '../../kit/fields.ts';

type AskKind = 'permission' | 'question';

export interface Ask {
  identity: string;
  address: string;
  spaceId: string;
  spaceName: string;
  tabId: string;
  paneId: string;
  agent: string;
  kind: AskKind;
  question: string;
  command: string | null;
  seq: number;
}

export interface AskAgent {
  address: string;
  pane: string;
  space: string;
  space_name: string;
  tab: string;
  seq: number;
  program: { name: string };
}

export interface AskSources {
  terminals: readonly unknown[];
  agents: readonly AskAgent[];
}

export interface AskView {
  focusedTab: string | null;
  windowActive: boolean;
}

const permissionQuestion = 'Allow this command?';

const unansweredQuestion = 'Waiting for your answer';

const workerRole = 'worker';

const kindOf = (report: Record<string, unknown>): AskKind | null => {
  const kind = stringOf(report['kind']);

  return kind === 'permission' || kind === 'question' ? kind : null;
};

const blockedKindOf = (record: Record<string, unknown>): AskKind | null => {
  const report = recordOf(record['report']);

  return stringOf(report['state']) === 'blocked' ? kindOf(report) : null;
};

const isWorker = (record: Record<string, unknown>): boolean =>
  stringOf(recordOf(record['labels'])['tau.role']) === workerRole;

const hasParent = (record: Record<string, unknown>): boolean => {
  const parent = record['parent'];

  return parent !== null && parent !== undefined;
};

const answersItself = (record: Record<string, unknown>): boolean =>
  isWorker(record) || hasParent(record);

const questionOf = (kind: AskKind, message: string): string => {
  if (kind === 'permission') {
    return permissionQuestion;
  }

  return message === '' ? unansweredQuestion : message;
};

const commandOf = (kind: AskKind, message: string): string | null =>
  kind === 'permission' && message !== '' ? message : null;

const askOf = (record: Record<string, unknown>, agent: AskAgent, kind: AskKind): Ask | null => {
  const address = stringOf(record['address']);

  if (address === null) {
    return null;
  }

  const message = stringOf(recordOf(record['report'])['msg']) ?? '';

  return {
    identity: `${address}:${kind}:${message}`,
    address,
    spaceId: agent.space,
    spaceName: agent.space_name,
    tabId: agent.tab,
    paneId: agent.pane,
    agent: agent.program.name,
    kind,
    question: questionOf(kind, message),
    command: commandOf(kind, message),
    seq: agent.seq,
  };
};

export const asksOf = (sources: AskSources): Ask[] => {
  const agentsByAddress = new Map(sources.agents.map((agent) => [agent.address, agent]));
  const asks: Ask[] = [];

  for (const value of sources.terminals) {
    const record = recordOf(value);
    const kind = blockedKindOf(record);

    if (kind === null || answersItself(record)) {
      continue;
    }

    const agent = agentsByAddress.get(stringOf(record['address']) ?? '');
    const ask = agent === undefined ? null : askOf(record, agent, kind);

    if (ask !== null) {
      asks.push(ask);
    }
  }

  return asks.toSorted((left, right) => right.seq - left.seq);
};

export const unseenAsks = (asks: readonly Ask[], view: AskView): Ask[] =>
  asks.filter((ask) => !view.windowActive || ask.tabId !== view.focusedTab);

export const identityListOf = (value: unknown): string[] =>
  listOf(value).filter((entry): entry is string => typeof entry === 'string');
