import { isRecord, numberOf, stringOf } from '../kit/fields.ts';
import { parsedJson } from '../kit/parsedJson.ts';
import { isPositiveWholeNumber } from './fields.ts';

export interface StackBranch {
  branch: string;
  pullNumber: number | null;
  restack: 'needed' | 'none' | 'unknown';
}

export interface Stack {
  trunk: string;
  branches: StackBranch[];
}

export type StackParse = { kind: 'parsed'; stacks: Stack[] } | { kind: 'failed' };

interface RecordedBranch {
  branch: string;
  base: string | null;
  pullNumber: number | null;
}

interface RecordedStack {
  trunk: string;
  branches: RecordedBranch[];
}

const knownSchemaVersion = 1;

const pullNumberOf = (value: unknown): number | null => {
  if (!isRecord(value)) {
    return null;
  }

  const number = value['number'];

  return isPositiveWholeNumber(number) ? number : null;
};

const recordedBranchOf = (value: unknown): RecordedBranch | null => {
  if (!isRecord(value)) {
    return null;
  }

  const branch = stringOf(value['branch']);

  if (branch === null) {
    return null;
  }

  return { branch, base: stringOf(value['base']), pullNumber: pullNumberOf(value['pullRequest']) };
};

const recordedStackOf = (value: unknown): RecordedStack | null => {
  if (!isRecord(value)) {
    return null;
  }

  const trunkRecord = value['trunk'];
  const trunk = isRecord(trunkRecord) ? stringOf(trunkRecord['branch']) : null;
  const entries = value['branches'];

  if (trunk === null || !Array.isArray(entries)) {
    return null;
  }

  const branches: RecordedBranch[] = [];

  for (const entry of entries) {
    const branch = recordedBranchOf(entry);

    if (branch === null) {
      return null;
    }

    branches.push(branch);
  }

  return { trunk, branches };
};

const restackOf = (
  recorded: RecordedBranch,
  parent: string,
  heads: ReadonlyMap<string, string>,
): StackBranch['restack'] => {
  const parentHead = heads.get(parent);

  if (recorded.base === null || parentHead === undefined) {
    return 'unknown';
  }

  return recorded.base === parentHead ? 'none' : 'needed';
};

const stackOfRecord = (recorded: RecordedStack, heads: ReadonlyMap<string, string>): Stack => {
  const branches: StackBranch[] = [];
  let parent = recorded.trunk;

  for (const branch of recorded.branches) {
    branches.push({
      branch: branch.branch,
      pullNumber: branch.pullNumber,
      restack: restackOf(branch, parent, heads),
    });

    parent = branch.branch;
  }

  return { trunk: recorded.trunk, branches };
};

export const parseStacks = (text: string, heads: ReadonlyMap<string, string>): StackParse => {
  const body = parsedJson(text);

  if (!isRecord(body) || numberOf(body['schemaVersion']) !== knownSchemaVersion) {
    return { kind: 'failed' };
  }

  const entries = body['stacks'];

  if (!Array.isArray(entries)) {
    return { kind: 'failed' };
  }

  const stacks: Stack[] = [];

  for (const entry of entries) {
    const recorded = recordedStackOf(entry);

    if (recorded === null) {
      return { kind: 'failed' };
    }

    stacks.push(stackOfRecord(recorded, heads));
  }

  return { kind: 'parsed', stacks };
};

export const stackOfBranch = (stacks: readonly Stack[], branch: string | null): Stack | null => {
  if (branch === null) {
    return null;
  }

  let holder: Stack | null = null;

  for (const stack of stacks) {
    if (!stack.branches.some((entry) => entry.branch === branch)) {
      continue;
    }

    if (holder !== null) {
      return null;
    }

    holder = stack;
  }

  return holder;
};
