import type { AgentInfo, Program, focused } from 'herdr';

import { numberOf, recordOf, stringOf } from '../kit/fields.ts';
import type { currentWindow } from '../kit/window.ts';
import type { TerminalMetadata } from './terminalRecord.ts';
import { terminalMetadata } from './terminalRecord.ts';

type AskKind = 'permission' | 'question';

export interface Ask {
  identity: string;
  address: string;
  spaceId: string;
  spaceName: string;
  project: string;
  tabId: string;
  paneId: string;
  agent: string;
  kind: AskKind;
  question: string;
  command: string | null;
  seq: number;
}

export type AskAgent = Pick<
  AgentInfo,
  'address' | 'pane' | 'space' | 'space_name' | 'tab' | 'seq'
> & { program: Pick<Program, 'name'> };

export interface AskSources {
  terminals: readonly unknown[];
  agents: readonly AskAgent[];
  projects: ReadonlyMap<string, string>;
}

export interface AskView {
  focusedTab: string | null;
  windowActive: boolean;
}

type FocusedTab = Pick<NonNullable<ReturnType<typeof focused>>, 'tab'>;

type ActiveWindow = Pick<NonNullable<ReturnType<typeof currentWindow>>, 'active'>;

export const askViewOf = (focus: FocusedTab | null, window: ActiveWindow | null): AskView => ({
  focusedTab: focus?.tab ?? null,
  windowActive: window?.active === true,
});

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

const hasParent = (record: Record<string, unknown>): boolean => {
  const parent = record['parent'];

  return parent !== null && parent !== undefined;
};

const askedThroughParent = (
  record: Record<string, unknown>,
  metadata: Map<unknown, TerminalMetadata>,
): boolean => metadata.get(record['address'])?.role === workerRole || hasParent(record);

const questionOf = (kind: AskKind, message: string): string => {
  if (kind === 'permission') {
    return permissionQuestion;
  }

  return message === '' ? unansweredQuestion : message;
};

const commandOf = (kind: AskKind, message: string): string | null =>
  kind === 'permission' && message !== '' ? message : null;

const askOf = (
  record: Record<string, unknown>,
  agent: AskAgent,
  kind: AskKind,
  project: string,
): Ask => {
  const message = stringOf(recordOf(record['report'])['msg']) ?? '';
  const turn = numberOf(record['turn']) ?? 0;

  return {
    identity: `${agent.address}:${turn}:${kind}:${message}`,
    address: agent.address,
    spaceId: agent.space,
    spaceName: agent.space_name,
    project,
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
  const metadata = terminalMetadata(sources.terminals);
  const asks: Ask[] = [];

  for (const value of sources.terminals) {
    const record = recordOf(value);
    const kind = blockedKindOf(record);

    if (kind === null || askedThroughParent(record, metadata)) {
      continue;
    }

    const address = stringOf(record['address']);
    const agent = address === null ? undefined : agentsByAddress.get(address);

    if (address !== null && agent !== undefined) {
      const project = sources.projects.get(agent.space) ?? agent.space_name;

      asks.push(askOf(record, agent, kind, project));
    }
  }

  return asks.toSorted((left, right) => right.seq - left.seq);
};

export const unseenAsks = (asks: readonly Ask[], view: AskView): Ask[] =>
  asks.filter((ask) => !view.windowActive || ask.tabId !== view.focusedTab);

export const unseenAskAddresses = (sources: AskSources, view: AskView): ReadonlySet<string> => {
  const addresses = unseenAsks(asksOf(sources), view).map((ask) => ask.address);

  return new Set(addresses);
};
