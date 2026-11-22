import type { GroveArguments, RiskKind } from './grove.ts';

type Refused = Extract<GroveArguments, { kind: 'refused' }>;

export const riskText: Record<RiskKind, string> = {
  changes: 'It has uncommitted changes. Removing it deletes them.',
  agent: 'An agent runs in its space. Removing it stops the agent.',
};

export const closeRiskText: Record<RiskKind, string> = {
  changes: 'The worktree is already removed.',
  agent:
    'The worktree is already removed. Closing the space stops the agent; Cancel leaves the space open and does not restore the worktree.',
};

export const refusedText = (refused: Refused): string =>
  `The ${refused.role} ${refused.name} starts with "-", which Grove reads as a flag.`;
